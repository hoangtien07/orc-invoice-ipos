import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import {
  IposItemCategory,
  IposUnit,
  IposUnitConversion,
  IposRecipe,
  IposWarehouse,
  IposCustomer,
  IposSupplier,
  IposSupplierGroup,
  IposPriceList,
  IposReason,
  IposStockNorm,
  LearnedItemAlias,
} from '../../../types';
import { formatVND } from '../../../utils/vietnamese';

// 2. Categories Tab
export const CategoriesTab: React.FC<{
  categories?: IposItemCategory[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ categories = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã nhóm</th>
          <th className="p-3">Tên nhóm hàng</th>
          <th className="p-3">Nhóm cha</th>
          <th className="p-3">Mô tả</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {categories.length === 0 ? (
          <tr>
            <td colSpan={6} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Nhóm hàng hoá. Nạp file Excel hoặc thêm mới.
            </td>
          </tr>
        ) : (
          categories.map((c, idx) => (
            <tr key={c.categoryId} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{c.categoryId}</td>
              <td className="p-3 font-medium text-slate-800">{c.categoryName}</td>
              <td className="p-3 text-slate-500">{c.parentCategoryId || '-'}</td>
              <td className="p-3 text-slate-500">{c.description || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(c.categoryId, c.categoryName)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 3. Units Tab
export const UnitsTab: React.FC<{
  units?: IposUnit[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ units = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã ĐVT</th>
          <th className="p-3">Tên đơn vị tính</th>
          <th className="p-3">Mô tả</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {units.length === 0 ? (
          <tr>
            <td colSpan={5} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Đơn vị tính.
            </td>
          </tr>
        ) : (
          units.map((u, idx) => (
            <tr key={u.unitId} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{u.unitId}</td>
              <td className="p-3 font-medium text-slate-800">{u.unitName}</td>
              <td className="p-3 text-slate-500">{u.description || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(u.unitId, u.unitName)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 4. Conversions Tab
export const ConversionsTab: React.FC<{
  conversions?: IposUnitConversion[];
  currentPage: number;
  pageSize: number;
  onDelete: (index: number, label: string) => void;
}> = ({ conversions = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Hàng hoá áp dụng</th>
          <th className="p-3">ĐVT nguồn</th>
          <th className="p-3">ĐVT đích (chuẩn)</th>
          <th className="p-3 text-center">Tỷ lệ quy đổi</th>
          <th className="p-3">Mô tả</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {conversions.length === 0 ? (
          <tr>
            <td colSpan={7} className="p-8 text-center text-slate-400">
              Chưa có quy tắc Quy đổi ĐVT nào.
            </td>
          </tr>
        ) : (
          conversions.map((c, idx) => (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3">
                {c.itemName || c.itemId ? (
                  <div>
                    <span className="font-semibold text-slate-800">{c.itemName}</span>
                    <span className="text-[11px] text-slate-400 font-mono block">{c.itemId}</span>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Toàn hệ thống (*)</span>
                )}
              </td>
              <td className="p-3 font-semibold text-indigo-700">{c.sourceUnitName}</td>
              <td className="p-3 font-semibold text-emerald-700">{c.targetUnitName}</td>
              <td className="p-3 text-center font-bold font-mono text-slate-800">
                1 {c.sourceUnitName} = {c.conversionRate} {c.targetUnitName}
              </td>
              <td className="p-3 text-slate-500">{c.description || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() =>
                    onDelete(
                      (currentPage - 1) * pageSize + idx,
                      `1 ${c.sourceUnitName} = ${c.conversionRate} ${c.targetUnitName}`
                    )
                  }
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 5. Recipes Tab
export const RecipesTab: React.FC<{
  recipes?: IposRecipe[];
  currentPage: number;
  pageSize: number;
  onDelete: (index: number, label: string) => void;
}> = ({ recipes = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã món</th>
          <th className="p-3">Tên món thành phẩm</th>
          <th className="p-3">Nguyên liệu</th>
          <th className="p-3 text-right">Định lượng</th>
          <th className="p-3">ĐVT</th>
          <th className="p-3 text-right">Hao hụt (%)</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {recipes.length === 0 ? (
          <tr>
            <td colSpan={8} className="p-8 text-center text-slate-400">
              Chưa có Công thức chế biến (BOM) nào.
            </td>
          </tr>
        ) : (
          recipes.map((r, idx) => (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{r.parentItemId}</td>
              <td className="p-3 font-medium text-slate-800">{r.parentItemName}</td>
              <td className="p-3">
                <span className="font-semibold text-emerald-800">{r.ingredientItemName}</span>
                <span className="text-[11px] text-slate-400 font-mono block">{r.ingredientItemId}</span>
              </td>
              <td className="p-3 text-right font-mono font-bold text-slate-800">{r.quantity}</td>
              <td className="p-3 text-slate-600">{r.unitName}</td>
              <td className="p-3 text-right text-slate-600">{r.lossRate ? `${r.lossRate}%` : '0%'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() =>
                    onDelete(
                      (currentPage - 1) * pageSize + idx,
                      `Nguyên liệu "${r.ingredientItemName}" của món "${r.parentItemName}"`
                    )
                  }
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 6. Warehouses Tab
export const WarehousesTab: React.FC<{
  warehouses?: IposWarehouse[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ warehouses = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã kho</th>
          <th className="p-3">Tên kho hàng</th>
          <th className="p-3">Chi nhánh</th>
          <th className="p-3">Địa chỉ</th>
          <th className="p-3">Điện thoại</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {warehouses.length === 0 ? (
          <tr>
            <td colSpan={7} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Kho hàng.
            </td>
          </tr>
        ) : (
          warehouses.map((w, idx) => (
            <tr key={w.warehouseId} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{w.warehouseId}</td>
              <td className="p-3 font-medium text-slate-800">{w.warehouseName}</td>
              <td className="p-3 text-slate-600">{w.branchId || '-'}</td>
              <td className="p-3 text-slate-500">{w.address || '-'}</td>
              <td className="p-3 text-slate-500">{w.phone || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(w.warehouseId, w.warehouseName)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 7. Customers Tab
export const CustomersTab: React.FC<{
  customers?: IposCustomer[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ customers = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã khách</th>
          <th className="p-3">Tên khách hàng</th>
          <th className="p-3">Số điện thoại</th>
          <th className="p-3">Mã số thuế</th>
          <th className="p-3">Nhóm khách</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {customers.length === 0 ? (
          <tr>
            <td colSpan={7} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Khách hàng.
            </td>
          </tr>
        ) : (
          customers.map((c, idx) => (
            <tr key={c.customerId} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{c.customerId}</td>
              <td className="p-3 font-medium text-slate-800">{c.customerName}</td>
              <td className="p-3 text-slate-600">{c.phone || '-'}</td>
              <td className="p-3 font-mono text-slate-500">{c.taxCode || '-'}</td>
              <td className="p-3 text-slate-600">{c.customerGroup || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(c.customerId, c.customerName)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 8. Suppliers Tab
export const SuppliersTab: React.FC<{
  suppliers?: IposSupplier[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ suppliers = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã NCC</th>
          <th className="p-3">Tên Nhà cung cấp</th>
          <th className="p-3">Mã số thuế</th>
          <th className="p-3">Điện thoại</th>
          <th className="p-3">Nhóm NCC</th>
          <th className="p-3">Địa chỉ</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {suppliers.length === 0 ? (
          <tr>
            <td colSpan={8} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Nhà cung cấp.
            </td>
          </tr>
        ) : (
          suppliers.map((s, idx) => (
            <tr key={s.supplierId} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{s.supplierId}</td>
              <td className="p-3 font-medium text-slate-800">{s.supplierName}</td>
              <td className="p-3 font-mono text-slate-600">{s.taxCode || '-'}</td>
              <td className="p-3 text-slate-600">{s.phone || '-'}</td>
              <td className="p-3 text-slate-600">{s.supplierGroup || '-'}</td>
              <td className="p-3 text-slate-500">{s.address || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(s.supplierId, s.supplierName)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 9. Supplier Groups Tab
export const SupplierGroupsTab: React.FC<{
  supplierGroups?: IposSupplierGroup[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ supplierGroups = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã nhóm NCC</th>
          <th className="p-3">Tên nhóm nhà cung cấp</th>
          <th className="p-3">Mô tả</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {supplierGroups.length === 0 ? (
          <tr>
            <td colSpan={5} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Nhóm nhà cung cấp.
            </td>
          </tr>
        ) : (
          supplierGroups.map((g, idx) => {
            const id = g.groupId || g.supplierGroupId || '';
            const name = g.groupName || g.supplierGroupName || '';
            return (
              <tr key={id || idx} className="hover:bg-slate-50/80 transition-colors">
                <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
                <td className="p-3 font-mono font-semibold text-slate-800">{id}</td>
                <td className="p-3 font-medium text-slate-800">{name}</td>
                <td className="p-3 text-slate-500">{g.description || '-'}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => onDelete(id, name)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>
);

// 10. Price Lists Tab
export const PriceListsTab: React.FC<{
  priceLists?: IposPriceList[];
  currentPage: number;
  pageSize: number;
  onDelete: (index: number, label: string) => void;
}> = ({ priceLists = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Bảng giá</th>
          <th className="p-3">Mã hàng</th>
          <th className="p-3">Tên hàng</th>
          <th className="p-3">ĐVT</th>
          <th className="p-3 text-right">Đơn giá</th>
          <th className="p-3">Ngày hiệu lực</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {priceLists.length === 0 ? (
          <tr>
            <td colSpan={8} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Bảng giá mua.
            </td>
          </tr>
        ) : (
          priceLists.map((p, idx) => (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-semibold text-slate-800">{p.priceListName}</td>
              <td className="p-3 font-mono text-slate-600">{p.itemId}</td>
              <td className="p-3 font-medium text-slate-800">{p.itemName}</td>
              <td className="p-3 text-slate-600">{p.unitName || '-'}</td>
              <td className="p-3 text-right font-bold text-emerald-800">{formatVND(p.price)}</td>
              <td className="p-3 text-slate-500">{p.effectiveDate || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() =>
                    onDelete((currentPage - 1) * pageSize + idx, `Giá mặt hàng "${p.itemName}"`)
                  }
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 11. Reasons Tab
export const ReasonsTab: React.FC<{
  reasons?: IposReason[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ reasons = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã lý do</th>
          <th className="p-3">Tên lý do</th>
          <th className="p-3">Loại</th>
          <th className="p-3">Mô tả</th>
          <th className="p-3">Mặc định</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {reasons.length === 0 ? (
          <tr>
            <td colSpan={7} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Lý do xuất nhập.
            </td>
          </tr>
        ) : (
          reasons.map((r, idx) => (
            <tr key={r.reasonId} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{r.reasonId}</td>
              <td className="p-3 font-medium text-slate-800">{r.reasonName}</td>
              <td className="p-3">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                  {r.reasonType === 'NHAP' || r.reasonType === 'IMPORT'
                    ? 'Nhập kho'
                    : r.reasonType === 'XUAT' || r.reasonType === 'EXPORT'
                    ? 'Xuất kho'
                    : 'Điều chỉnh'}
                </span>
              </td>
              <td className="p-3 text-slate-500">{r.description || '-'}</td>
              <td className="p-3 text-slate-600">{r.isDefault ? 'Mặc định' : '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(r.reasonId, r.reasonName)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 12. Stock Norms Tab
export const StockNormsTab: React.FC<{
  stockNorms?: IposStockNorm[];
  currentPage: number;
  pageSize: number;
  onDelete: (index: number, label: string) => void;
}> = ({ stockNorms = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Mã hàng</th>
          <th className="p-3">Tên hàng</th>
          <th className="p-3">Mã kho</th>
          <th className="p-3 text-right">Tồn tối thiểu (Min)</th>
          <th className="p-3 text-right">Tồn tối đa (Max)</th>
          <th className="p-3">ĐVT</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {stockNorms.length === 0 ? (
          <tr>
            <td colSpan={8} className="p-8 text-center text-slate-400">
              Chưa có dữ liệu Định mức tồn kho.
            </td>
          </tr>
        ) : (
          stockNorms.map((n, idx) => (
            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{n.itemId}</td>
              <td className="p-3 font-medium text-slate-800">{n.itemName}</td>
              <td className="p-3 font-mono text-slate-600">{n.warehouseId}</td>
              <td className="p-3 text-right font-mono font-bold text-amber-700">{n.minStock}</td>
              <td className="p-3 text-right font-mono font-bold text-slate-800">{n.maxStock}</td>
              <td className="p-3 text-slate-600">{n.unitName || '-'}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() =>
                    onDelete((currentPage - 1) * pageSize + idx, `Định mức mặt hàng "${n.itemName}"`)
                  }
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

// 14. Aliases Tab
export const AliasesTab: React.FC<{
  aliases?: LearnedItemAlias[];
  currentPage: number;
  pageSize: number;
  onDelete: (id: string, name: string) => void;
}> = ({ aliases = [], currentPage, pageSize, onDelete }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
        <tr>
          <th className="p-3 w-12 text-center">STT</th>
          <th className="p-3">Tên gốc trên hóa đơn đỏ (Raw)</th>
          <th className="p-3">Mã iPOS đã khớp</th>
          <th className="p-3">Tên hàng hóa iPOS chuẩn</th>
          <th className="p-3">Nhà cung cấp</th>
          <th className="p-3 text-center">Số lần dùng</th>
          <th className="p-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {aliases.length === 0 ? (
          <tr>
            <td colSpan={7} className="p-8 text-center text-slate-400">
              Chưa có từ điển học máy nào. Khi bạn xác nhận hoặc sửa hàng hóa ở màn hình quét hóa đơn, hệ thống sẽ tự động học và lưu tại đây.
            </td>
          </tr>
        ) : (
          aliases.map((a, idx) => (
            <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
              <td className="p-3 text-center text-slate-400">{(currentPage - 1) * pageSize + idx + 1}</td>
              <td className="p-3 font-medium text-amber-900 bg-amber-50/30">{a.raw_item_sample}</td>
              <td className="p-3 font-mono font-semibold text-slate-800">{a.selected_item_id}</td>
              <td className="p-3 font-semibold text-emerald-800">{a.selected_item_name}</td>
              <td className="p-3 text-slate-600">
                {a.supplier_name ? `${a.supplier_name} (${a.supplier_id})` : 'Mọi NCC (*)'}
              </td>
              <td className="p-3 text-center font-bold text-slate-700">{a.timesUsed || 1}</td>
              <td className="p-3 text-right">
                <button
                  onClick={() => onDelete(a.id, a.raw_item_sample)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);
