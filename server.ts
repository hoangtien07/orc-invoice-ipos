import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware for parsing large base64 payload (invoice images/PDFs)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Google GenAI client
const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Zod validation schema for raw extracted invoice data
const rawInvoiceRowSchema = z.object({
  line_no: z.number(),
  raw_item_name: z.string().min(1),
  raw_unit: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  visual_certainty: z.enum(['high', 'medium', 'low']).default('high'),
  needs_review: z.boolean().default(false),
  review_reason: z.string().nullable().optional(),
});

const rawInvoiceResponseSchema = z.object({
  supplier_raw_name: z.string().nullable().optional(),
  document_date: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  rows: z.array(rawInvoiceRowSchema),
});

// Gemini JSON response schema definition
const geminiInvoiceSchema = {
  type: Type.OBJECT,
  properties: {
    supplier_raw_name: {
      type: Type.STRING,
      description: 'Tên nhà cung cấp hoặc tên cửa hàng xuất hiện trên hóa đơn/phiếu giao hàng. Null nếu không tìm thấy.',
    },
    document_date: {
      type: Type.STRING,
      description: 'Ngày chứng từ hoặc ngày giao hàng (ưu tiên định dạng YYYY-MM-DD nếu rõ ràng, ví dụ 2025-05-18). Null nếu không rõ.',
    },
    invoice_number: {
      type: Type.STRING,
      description: 'Số hóa đơn, số phiếu thu, số phiếu giao hàng hoặc mã chứng từ. Null nếu không có.',
    },
    note: {
      type: Type.STRING,
      description: 'Ghi chú thêm trên hóa đơn hoặc chữ ký/người giao hàng.',
    },
    rows: {
      type: Type.ARRAY,
      description: 'Danh sách các dòng hàng hóa trên hóa đơn/phiếu.',
      items: {
        type: Type.OBJECT,
        properties: {
          line_no: {
            type: Type.INTEGER,
            description: 'Số thứ tự dòng (1, 2, 3...)',
          },
          raw_item_name: {
            type: Type.STRING,
            description: 'Tên hàng hóa viết tay hoặc in trên phiếu. Giữ nguyên chữ gốc tiếng Việt faithfully.',
          },
          raw_unit: {
            type: Type.STRING,
            description: 'Đơn vị tính trên phiếu (kg, kg, hộp, chai, lon, thùng, túi, con, bó...). Null nếu phiếu để trống.',
          },
          quantity: {
            type: Type.NUMBER,
            description: 'Số lượng mua. Chuyển đổi dấu phẩy thập phân tiếng Việt chính xác (ví dụ 2,5 -> 2.5). Null nếu không ghi.',
          },
          price: {
            type: Type.NUMBER,
            description: 'Đơn giá một đơn vị. Bỏ ký hiệu đ/đ/VND. Null nếu không ghi.',
          },
          amount: {
            type: Type.NUMBER,
            description: 'Thành tiền của dòng. Null nếu không ghi.',
          },
          visual_certainty: {
            type: Type.STRING,
            description: 'Độ rõ nét trực quan của dòng: "high" nếu chữ in rõ, "medium" nếu chữ viết tay dễ đọc, "low" nếu chữ mờ/nét nguệch ngoạc khó đoán.',
          },
          needs_review: {
            type: Type.BOOLEAN,
            description: 'True nếu dòng này có chữ viết tay mờ, bị gạch xóa, viết đè, hoặc thông tin bất thường cần con người kiểm tra.',
          },
          review_reason: {
            type: Type.STRING,
            description: 'Lý do cần kiểm tra nếu needs_review là true (ví dụ: "chữ viết tay mờ", "số lượng sửa đè 3 thành 5").',
          },
        },
        required: ['line_no', 'raw_item_name', 'visual_certainty', 'needs_review'],
      },
    },
  },
  required: ['rows'],
};

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Endpoint: AI Extract Invoice with multi-model fallback and retry resilience
const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientError(error: any): boolean {
  const errStr = (error?.message || error?.toString?.() || JSON.stringify(error) || '').toLowerCase();
  const statusCode = error?.status || error?.code || error?.error?.code;
  return (
    statusCode === 503 ||
    statusCode === 429 ||
    statusCode === 500 ||
    errStr.includes('503') ||
    errStr.includes('429') ||
    errStr.includes('unavailable') ||
    errStr.includes('high demand') ||
    errStr.includes('resource_exhausted') ||
    errStr.includes('overloaded') ||
    errStr.includes('rate limit') ||
    errStr.includes('quota')
  );
}

app.post('/api/extract-invoice', async (req, res) => {
  try {
    const { imageBase64, mimeType, fileName } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing imageBase64 document data' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra tab Settings > Secrets.',
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const cleanMimeType = mimeType || 'image/jpeg';

    const systemPrompt = `Bạn là chuyên gia thị giác AI phân tích hóa đơn, phiếu giao hàng, phiếu xuất kho, hóa đơn bán lẻ tiếng Việt của các nhà cung cấp thực phẩm, nguyên vật liệu F&B và nhà hàng.
Nhiệm vụ của bạn: Trích xuất CHÍNH XÁC và TRUNG THỰC thông tin THÔ (RAW) từ ảnh chụp hoặc file PDF hóa đơn được cung cấp.

QUY TẮC BẮT BUỘC:
1. Giữ nguyên chữ viết tay/chữ in tên hàng gốc càng trung thực càng tốt (raw_item_name). Không tự ý dịch, không tự ý sửa tên hay gán mã hàng iPOS tại bước này.
2. Dấu phẩy thập phân tiếng Việt phải chuyển đổi chuẩn sang số thực: ví dụ "2,5" -> 2.5, "0,75" -> 0.75, "1.250.000" -> 1250000.
3. KHÔNG ĐƯỢC TỰ BỊA (never invent) số lượng, đơn vị tính, đơn giá nếu trên phiếu bị rách, mờ tịt hoặc không ghi. Hãy để null.
4. Đơn vị tính (raw_unit): Giữ đúng chữ ghi trên phiếu (ví dụ: "kg", "Hộp", "thùng", "ch", "lít", "gói"). Nếu dòng đó người viết không điền ĐVT, trả về null.
5. visual_certainty: Đánh giá "high" (rõ nét), "medium" (đọc được nhưng viết tay), "low" (chữ mờ, nhoè, rách, khó đọc).
6. needs_review: Đặt true nếu phát hiện vết gạch xóa, viết đè số lượng/đơn giá, hoặc chữ viết tay quá mờ.`;

    let lastError: any = null;
    let responseText: string | null = null;
    let usedModel: string = CANDIDATE_MODELS[0];

    // Try candidate models in priority order
    for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
      const modelName = CANDIDATE_MODELS[i];
      const isLastModel = i === CANDIDATE_MODELS.length - 1;
      const maxRetries = isLastModel ? 2 : 1;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Gemini Extraction] Calling model: ${modelName} (attempt ${attempt + 1}/${maxRetries + 1})...`);
          
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    data: cleanBase64,
                    mimeType: cleanMimeType,
                  },
                },
                {
                  text: 'Hãy đọc và trích xuất tất cả các dòng hàng hóa cùng thông tin nhà cung cấp và ngày chứng từ từ hóa đơn này theo đúng định dạng JSON Schema.',
                },
              ],
            },
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: 'application/json',
              responseSchema: geminiInvoiceSchema,
              temperature: 0.1, // Low temperature for high precision extraction
            },
          });

          if (response?.text) {
            responseText = response.text;
            usedModel = modelName;
            console.log(`[Gemini Extraction] Success using model: ${modelName}`);
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[Gemini Extraction] Attempt with model ${modelName} encountered error:`, err?.message || err);

          // If high demand/503/429 occurs on this model and we have more models, immediately move to the next model
          if (isTransientError(err) && !isLastModel) {
            console.log(`[Gemini Extraction] Model ${modelName} is busy/unavailable, fast-failing to next candidate model...`);
            break;
          }

          // If it's the last model or we want to retry on transient error
          if (isTransientError(err) && attempt < maxRetries) {
            const delayMs = (attempt + 1) * 1000;
            console.log(`[Gemini Extraction] Transient error on ${modelName}, retrying in ${delayMs}ms...`);
            await sleep(delayMs);
            continue;
          }

          break;
        }
      }

      if (responseText) {
        break;
      }
    }

    if (!responseText) {
      throw lastError || new Error('Không thể nhận phản hồi từ các mô hình Gemini AI. Vui lòng thử lại sau giây lát.');
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response as JSON:', responseText);
      throw new Error('Định dạng phản hồi từ AI không hợp lệ');
    }

    // Validate with Zod
    const validatedData = rawInvoiceResponseSchema.parse(parsedJson);

    return res.json({
      success: true,
      data: validatedData,
      modelUsed: usedModel,
      rawCount: validatedData.rows.length,
    });
  } catch (error: any) {
    console.error('Error in /api/extract-invoice:', error);
    const isOverload = isTransientError(error);
    const userMessage = isOverload
      ? 'Hệ thống Gemini AI đang chịu tải cao tạm thời (503/429). Hệ thống đã tự động thử lại nhiều lần nhưng chưa thành công. Vui lòng bấm "Thử lại ngay" hoặc chờ 5-10 giây.'
      : (error.message || 'Lỗi xử lý hóa đơn qua Gemini AI');

    return res.status(500).json({
      success: false,
      error: userMessage,
      details: error instanceof z.ZodError ? (error.issues ?? (error as any).errors) : error?.message,
    });
  }
});

// Setup Vite middleware or static serving
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`iPOS Invoice AI Server running on http://0.0.0.0:${PORT}`);
  });
}

setupServer();
