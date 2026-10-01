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
  line_no: z.union([z.number(), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) || 1 : v)),
  raw_item_name: z.string().default('Hàng hóa chưa đặt tên'),
  raw_unit: z.string().nullable().optional(),
  quantity: z.union([z.number(), z.string()]).nullable().optional().transform((v) => (typeof v === 'string' ? parseFloat(v.replace(/,/g, '.')) || null : v)),
  price: z.union([z.number(), z.string()]).nullable().optional().transform((v) => (typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) || null : v)),
  amount: z.union([z.number(), z.string()]).nullable().optional().transform((v) => (typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) || null : v)),
  visual_certainty: z.enum(['high', 'medium', 'low']).default('high').catch('high'),
  needs_review: z.boolean().default(false).catch(false),
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

// Candidate models in priority order: Gemini 3.8 Flash -> Flash Latest -> Flash Lite
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
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

    const systemPrompt = `Bạn là chuyên gia thị giác AI phân tích hóa đơn, phiếu giao hàng, phiếu xuất kho tiếng Việt cho ngành F&B và nhà hàng.

NHIỆM VỤ:
Đọc và trích xuất CHÍNH XÁC 100% từng ký tự, con số và bảng biểu từ ảnh chụp phiếu giao hàng. Tuyệt đối KHÔNG hallucinate, KHÔNG tự ý suy đoán tên hàng ngoài ảnh.

QUY TẮC TRÍCH XUẤT BẮT BUỘC:

1. PHÂN BIỆT RÕ RÀNG DẤU THANH TIẾNG VIỆT:
   - Phải phân biệt chính xác: "Ngò" (o huyền - ngò rí, ngò tây, ngò gai) KHÁC HOÀN TOÀN với "Ngô" (ô ngã - ngô ngọt, bắp ngô).
   - "Mồng tơi" KHÁC "Mông tươi".
   - "Tỏi củ" KHÁC "Túi cuộn".
   - "Dưa hấu", "Dưa leo", "Lá dứa" KHÁC "Đũa".
   - "Baroi heo" (viết tắt của Ba rọi / Ba chỉ heo) giữ nguyên chữ gốc "Baroi heo".
   - Giữ nguyên chữ gốc in hoặc viết tay (raw_item_name), không tự ý sửa sang từ ngữ khác.

2. ĐỌC THEO TỪNG CỘT CỦA BẢNG:
   - Quét từng dòng từ trên xuống dưới theo đúng số thứ tự STT (1, 2, 3, 4, 5, 6, 7, 8, 9, 10...).
   - Trích xuất đủ các trường cơ bản trên mỗi dòng:
     + line_no: Số thứ tự dòng (STT).
     + raw_item_name: Tên hàng hóa in/viết trên phiếu (giữ nguyên chữ gốc tiếng Việt faithfully).
     + raw_unit: Đơn vị tính ghi trên phiếu (kg, gói, miếng, vỉ, can, cái...). Nếu để trống trả về null.
     + quantity: Số lượng giao (xử lý đúng dấu phẩy thập phân: 0.50, 0.30, 3.00, 4.50).
     + price: Đơn giá 1 đơn vị. Bỏ ký hiệu đ/đ/VND.
     + amount: Thành tiền của dòng.

3. KIỂM TRA TOÁN HỌC DÒNG:
   - Kiểm tra điều kiện: quantity * price ≈ amount.
   - Nếu phát hiện dòng có dấu gạch ngang hoặc đánh dấu "X" ở cột số lượng (như dòng Củ cải đỏ):
     + Đặt needs_review = true.
     + Ghi vào review_reason: "Dòng hàng bị gạch ngang / đánh dấu X".
   - Nếu phát hiện vết gạch xóa, viết đè số lượng/đơn giá, hoặc chữ viết tay quá mờ/không khớp toán học:
     + Đặt needs_review = true.
     + Ghi rõ lý do vào review_reason.

4. ĐỊNH DẠNG ĐẦU RA JSON:
Tuân thủ nghiêm ngặt cấu trúc JSON Schema được cung cấp.`;

    let lastError: any = null;
    let responseText: string | null = null;
    let usedModel: string = CANDIDATE_MODELS[0];

    // Try candidate models in priority order with fast fallback on 503/high-demand
    for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
      const modelName = CANDIDATE_MODELS[i];
      try {
        console.log(`[Gemini Extraction] Calling model: ${modelName}...`);
        
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
        console.warn(`[Gemini Extraction] Model ${modelName} encountered error (Status: ${err?.status || err?.code}):`, err?.message || err);

        // If 503 / High Demand / Unavailable / 429, immediately fallback to next candidate model!
        if (isTransientError(err)) {
          console.log(`[Gemini Extraction] 503/High-demand detected on ${modelName}. Cascading instantly to next fallback model...`);
          continue;
        }
      }
    }

    if (!responseText) {
      throw lastError || new Error('Không thể nhận phản hồi từ các mô hình Gemini AI. Vui lòng thử lại sau giây lát.');
    }

    let parsedJson: any;
    try {
      let cleaned = responseText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      parsedJson = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response as JSON:', responseText);
      throw new Error('Định dạng phản hồi từ AI không hợp lệ');
    }

    // Filter and sanitize rows
    if (parsedJson && Array.isArray(parsedJson.rows)) {
      parsedJson.rows = parsedJson.rows.filter((r: any) => r && (r.raw_item_name || r.quantity || r.price));
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
      ? 'Hệ thống Gemini AI đang chịu tải cao tạm thời (503/429). Vui lòng bấm "Thử lại ngay" hoặc đổi ảnh.'
      : (error.message || 'Lỗi xử lý hóa đơn qua Gemini AI');

    return res.status(500).json({
      success: false,
      error: userMessage,
      details: error instanceof z.ZodError ? (error.issues ?? (error as any).errors) : error?.message,
    });
  }
});

// ==========================================
// PHASE 2: SMART AI RECONCILIATION DIAGNOSTICS
// ==========================================

const geminiReconciliationDiagnosisSchema = {
  type: Type.OBJECT,
  properties: {
    executiveSummary: {
      type: Type.STRING,
      description: 'Tổng kết đánh giá rủi ro tài chính và sai lệch công nợ một cách súc tích (2-3 câu).',
    },
    rootCauses: {
      type: Type.ARRAY,
      description: 'Danh sách các nguyên nhân gốc rễ dẫn đến sai lệch.',
      items: {
        type: Type.OBJECT,
        properties: {
          cause: { type: Type.STRING, description: 'Tên nguyên nhân (ví dụ: Tự ý tăng giá không báo trước, Hao hụt tự nhiên tươi sống, Tính tiền món chưa giao)' },
          severity: { type: Type.STRING, description: 'Mức độ nghiêm trọng: HIGH, MEDIUM, LOW' },
          affectedItems: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Các mặt hàng bị ảnh hưởng' },
          explanation: { type: Type.STRING, description: 'Phân tích chi tiết nguyên nhân theo nghiệp vụ nhà hàng F&B' },
        },
        required: ['cause', 'severity', 'affectedItems', 'explanation'],
      },
    },
    actionRecommendations: {
      type: Type.ARRAY,
      description: 'Đề xuất hành động xử lý cụ thể cho từng mặt hàng sai lệch.',
      items: {
        type: Type.OBJECT,
        properties: {
          itemName: { type: Type.STRING },
          financialImpact: { type: Type.STRING, description: 'Số tiền và tác động tài chính' },
          suggestedAction: { type: Type.STRING, description: 'Hành động cụ thể (Trừ tiền, Chấp nhận hao hụt, Bổ sung phiếu kho)' },
          negotiationScript: { type: Type.STRING, description: 'Lý lẽ đàm phán hoặc căn cứ đối chất với NCC' },
        },
        required: ['itemName', 'financialImpact', 'suggestedAction', 'negotiationScript'],
      },
    },
    formalNoticeText: {
      type: Type.STRING,
      description: 'Toàn văn công văn/thông báo đối soát gửi NCC (kèm tiêu đề, kính gửi, bảng chi tiết tiền trừ, đề nghị xuất hóa đơn điều chỉnh hoặc cấn trừ công nợ, chữ ký đại diện).',
    },
  },
  required: ['executiveSummary', 'rootCauses', 'actionRecommendations', 'formalNoticeText'],
};

app.post('/api/reconciliation-diagnose', async (req, res) => {
  try {
    const { supplierName, summary, discrepancies } = req.body;

    if (!discrepancies || !Array.isArray(discrepancies) || discrepancies.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có danh sách chênh lệch để phân tích' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ.',
      });
    }

    const systemPrompt = `Bạn là Giám đốc Tài chính (CFO) & Chuyên gia Kiểm toán Kho Vận cao cấp chuyên về ngành Chuỗi Nhà Hàng & F&B tại Việt Nam.
Nhiệm vụ của bạn là phân tích sâu nguyên nhân gốc rễ các sai lệch giữa Báo cáo thực nhập kho IVT iPOS và Hóa đơn điện tử VAT của Nhà cung cấp.
Sau đó, hãy soạn thảo một Công văn / Thông báo Đối soát Công nợ trang trọng, sắc bén, tuân thủ Nghị định 123/2020/NĐ-CP và Luật Quản lý Thuế Việt Nam để nhà hàng gửi cho Nhà cung cấp yêu cầu cấn trừ công nợ hoặc xuất hóa đơn điều chỉnh.`;

    const userPrompt = `Hãy phân tích dữ liệu đối soát thực tế của Nhà cung cấp: "${supplierName || 'Nhà cung cấp'}"
Tổng số tiền thực nhận (iPOS): ${summary?.totalIposAmount?.toLocaleString('vi-VN')} đ
Tổng số tiền Hóa đơn NCC: ${summary?.totalInvoiceAmount?.toLocaleString('vi-VN')} đ
Tổng số tiền NCC tính thừa đề nghị trừ: ${summary?.totalOverchargedAmount?.toLocaleString('vi-VN')} đ

Danh sách các mặt hàng có chênh lệch:
${JSON.stringify(discrepancies, null, 2)}

Hãy xuất kết quả phân tích theo đúng cấu trúc JSON Schema được yêu cầu.`;

    let responseText: string | null = null;
    let usedModel = CANDIDATE_MODELS[0];

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[Gemini Diagnosis] Calling model: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: geminiReconciliationDiagnosisSchema,
            temperature: 0.2,
          },
        });

        if (response?.text) {
          responseText = response.text;
          usedModel = modelName;
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini Diagnosis] Model ${modelName} failed:`, err?.message);
        if (isTransientError(err)) {
          await sleep(1000);
          continue;
        }
      }
    }

    if (!responseText) {
      throw new Error('Tất cả mô hình AI đều không thể phản hồi');
    }

    const parsedData = JSON.parse(responseText);
    return res.json({
      success: true,
      data: parsedData,
      modelUsed: usedModel,
    });
  } catch (error: any) {
    console.error('Error in /api/reconciliation-diagnose:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Lỗi phân tích AI',
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
