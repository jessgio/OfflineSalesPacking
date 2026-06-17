"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Search,
  UploadCloud,
} from "lucide-react";
import {
  CenteredPage,
  DashButton,
  SurfaceCard,
  cx,
  fieldInput,
} from "../../../components/dashboard/primitives";
import { clearMarketingSession, getMarketingSession, setMarketingSession } from "../../../lib/marketingAuth";
import { refreshMarketingSession } from "../../../lib/marketingDb";
import { canAccessFulfillPortal } from "../../../lib/marketingRoles";
import { downloadProductImportTemplate, parseProductImportCsv } from "../../../lib/productImport";
import { fetchProducts, updateProductRsp, upsertProducts, type ProductRow } from "../../../lib/productsDb";
import { formatIdr } from "../../../lib/shipmentValue";
import type { MarketingSession } from "../../../types/marketing";

function formatRspInput(value: number | null): string {
  return value != null && value > 0 ? String(value) : "";
}

export default function ProductDatabasePage() {
  const router = useRouter();
  const [session, setSession] = useState<MarketingSession | null>(null);
  const [booting, setBooting] = useState(true);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingBarcode, setSavingBarcode] = useState<string | null>(null);
  const [rspDrafts, setRspDrafts] = useState<Record<string, string>>({});

  const [importFileName, setImportFileName] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");

  useEffect(() => {
    const stored = getMarketingSession();
    if (!stored) {
      setBooting(false);
      return;
    }
    void refreshMarketingSession(stored)
      .then((refreshed) => {
        setMarketingSession(refreshed);
        setSession(refreshed);
      })
      .catch(() => {
        setSession(stored);
      })
      .finally(() => {
        setBooting(false);
      });
  }, []);

  useEffect(() => {
    if (booting) return;
    if (!session) {
      router.replace("/?portal=fulfill");
      return;
    }
    if (!canAccessFulfillPortal(session)) {
      router.replace("/marketing");
    }
  }, [booting, router, session]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchProducts(search);
      setProducts(rows);
      setRspDrafts(
        Object.fromEntries(rows.map((row) => [row.barcode, formatRspInput(row.rsp)]))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!session || !canAccessFulfillPortal(session)) return;
    const timer = setTimeout(() => {
      void loadProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [session, loadProducts]);

  const handleLogout = () => {
    clearMarketingSession();
    setSession(null);
    router.push("/");
  };

  const handleSaveRsp = async (barcode: string) => {
    const raw = rspDrafts[barcode] ?? "";
    const digits = raw.replace(/[^\d]/g, "");
    const rsp = digits ? Number.parseInt(digits, 10) : null;
    if (digits && (!Number.isFinite(rsp) || rsp! < 0)) {
      setError(`Invalid RSP for ${barcode}`);
      return;
    }

    setSavingBarcode(barcode);
    setError("");
    try {
      await updateProductRsp(barcode, rsp);
      await loadProducts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save RSP");
    } finally {
      setSavingBarcode(null);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportFileName(file.name);
    setImportSuccess("");
    setImportErrors([]);
    setImportPreview([]);

    try {
      const text = await file.text();
      const result = parseProductImportCsv(text);
      if (result.errors.length > 0) {
        setImportErrors(result.errors);
        return;
      }
      setImportPreview(result.products);
    } catch (err: unknown) {
      setImportErrors([err instanceof Error ? err.message : "Could not read file"]);
    }
  };

  const handleImportSubmit = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportErrors([]);
    setImportSuccess("");
    try {
      const { upserted } = await upsertProducts(importPreview);
      setImportSuccess(`Imported ${upserted} product${upserted === 1 ? "" : "s"}.`);
      setImportPreview([]);
      setImportFileName("");
      await loadProducts();
    } catch (err: unknown) {
      setImportErrors([err instanceof Error ? err.message : "Import failed"]);
    } finally {
      setImporting(false);
    }
  };

  if (booting) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
      </CenteredPage>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/marketing/fulfill">
              <DashButton variant="ghost" size="sm" className="p-2 bg-gray-100">
                <ArrowLeft className="w-5 h-5" />
              </DashButton>
            </Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Catalog</p>
              <h1 className="text-xl font-black text-gray-900">Product database</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:block">{session.displayName}</span>
            <DashButton variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" /> Sign out
            </DashButton>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <SurfaceCard className="p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Bulk import products</h2>
          <p className="text-sm text-gray-600 mb-4">
            Upload a CSV to add or update products. Required columns:{" "}
            <span className="font-mono font-semibold">barcode</span>,{" "}
            <span className="font-mono font-semibold">clean_name</span>. Optional:{" "}
            <span className="font-mono font-semibold">rsp</span> (IDR),{" "}
            <span className="font-mono font-semibold">sociolla_sku</span>.
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            <DashButton type="button" variant="subtle" size="md" onClick={downloadProductImportTemplate}>
              <Download className="w-4 h-4" /> Download template
            </DashButton>
            <a href="/product-import-template.csv" download className="inline-flex">
              <DashButton type="button" variant="secondary" size="md">
                <FileSpreadsheet className="w-4 h-4" /> Template file
              </DashButton>
            </a>
          </div>

          <div className="border-2 border-dashed border-violet-200 bg-violet-50/40 rounded-xl p-8 text-center relative mb-4">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleImportFile}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <UploadCloud className="w-10 h-10 text-violet-600 mx-auto mb-3" />
            <p className="font-semibold text-gray-800">Click or drag a product CSV here</p>
            <p className="text-sm text-gray-600 mt-1">
              {importFileName ? `Loaded: ${importFileName}` : "Use the template columns — do not rename headers"}
            </p>
          </div>

          {importErrors.length > 0 && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 space-y-1">
              <p className="font-bold">Fix these issues before importing:</p>
              <ul className="list-disc list-inside">
                {importErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {importSuccess && (
            <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
              {importSuccess}
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-gray-800">
                Preview — {importPreview.length} product{importPreview.length === 1 ? "" : "s"}
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-600">
                    <tr>
                      <th className="px-4 py-3">Barcode</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3 text-right">RSP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row) => (
                      <tr key={row.barcode} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-mono text-xs">{row.barcode}</td>
                        <td className="px-4 py-2">{row.clean_name}</td>
                        <td className="px-4 py-2 text-right">
                          {row.rsp != null ? formatIdr(row.rsp) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DashButton
                type="button"
                variant="primary"
                size="md"
                disabled={importing}
                onClick={() => void handleImportSubmit()}
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import products"}
              </DashButton>
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">All products</h2>
              <p className="text-sm text-gray-600">
                RSP is used to calculate declared shipment value for insurance when booking couriers.
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or barcode…"
                className={cx(fieldInput, "w-full pl-9")}
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-10">No products found.</p>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-600">
                  <tr>
                    <th className="px-4 py-3">Barcode</th>
                    <th className="px-4 py-3">Product name</th>
                    <th className="px-4 py-3">Sociolla SKU</th>
                    <th className="px-4 py-3 min-w-[180px]">RSP (IDR)</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.barcode} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-mono text-xs text-gray-800">{product.barcode}</td>
                      <td className="px-4 py-3 text-gray-900">{product.clean_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {product.sociolla_sku ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={rspDrafts[product.barcode] ?? ""}
                          onChange={(e) =>
                            setRspDrafts((prev) => ({ ...prev, [product.barcode]: e.target.value }))
                          }
                          placeholder="e.g. 189000"
                          className={cx(fieldInput, "w-full")}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <DashButton
                          type="button"
                          variant="subtle"
                          size="sm"
                          disabled={savingBarcode === product.barcode}
                          onClick={() => void handleSaveRsp(product.barcode)}
                        >
                          {savingBarcode === product.barcode ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Save"
                          )}
                        </DashButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SurfaceCard>
      </main>
    </div>
  );
}
