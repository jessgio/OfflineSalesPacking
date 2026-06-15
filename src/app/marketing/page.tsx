"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  LogOut,
  Package,
  Plus,
  Send,
  Trash2,
  CheckCircle2,
  Clock,
  Truck,
  UploadCloud,
  Download,
  FileSpreadsheet,
  Pencil,
  X,
  List,
  ChevronRight,
  LayoutDashboard,
  TableProperties,
} from "lucide-react";
import { CenteredPage, DashButton, SurfaceCard, cx, fieldInput } from "../../components/dashboard/primitives";
import {
  clearMarketingSession,
  getMarketingSession,
  setMarketingSession,
} from "../../lib/marketingAuth";
import {
  createMarketingRequest,
  createMarketingRequestsBulk,
  deleteMarketingRequest,
  fetchMarketingRequestPurposes,
  fetchMarketingRequestsByUser,
  fetchAllMarketingRequestsForRegistry,
  loginMarketingUser,
  refreshMarketingSession,
  searchProducts,
  updateMarketingRequest,
} from "../../lib/marketingDb";
import {
  downloadMarketingImportTemplate,
  parseMarketingImportCsv,
  type MarketingImportPreviewRow,
} from "../../lib/marketingImport";
import { MarketingAddressFields } from "../../components/marketing/MarketingAddressFields";
import { MarketingChatNotifications } from "../../components/marketing/MarketingChatNotifications";
import { MarketingDashboard } from "../../components/marketing/MarketingDashboard";
import { MarketingRequestDetailModal } from "../../components/marketing/MarketingRequestDetailModal";
import { MarketingPortalShipmentsPanel } from "../../components/marketing/MarketingPortalShipmentsPanel";
import { MarketingSavedPurposesManager } from "../../components/marketing/MarketingSavedPurposesManager";
import { MarketingSummaryPanel } from "../../components/marketing/MarketingSummaryPanel";
import { MarketingPurposeSummary } from "../../components/marketing/MarketingPurposeSummary";
import { RequestChat } from "../../components/marketing/RequestChat";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useMarketingChatUnread } from "../../hooks/useMarketingChatUnread";
import { buildPortalShipmentRequests } from "../../lib/marketingPortalFilters";
import { canAccessRequestPortal, canDeleteMarketingShipment, isAdmin, roleLabel } from "../../lib/marketingRoles";
import {
  MARKETING_COURIER_OPTIONS,
  type MarketingCourier,
  type MarketingRequest,
  type MarketingSession,
} from "../../types/marketing";

type DraftItem = { product_barcode: string; product_name: string; qty: number };

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  packed: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cx("text-xs font-bold uppercase px-2 py-1 rounded-full", statusStyles[status] ?? statusStyles.pending)}>
      {status}
    </span>
  );
}

type PurposeGroup = {
  purposeKey: string;
  label: string;
  requests: MarketingRequest[];
};

function groupRequestsByPurpose(requests: MarketingRequest[]): PurposeGroup[] {
  const groups = new Map<string, MarketingRequest[]>();

  for (const req of requests) {
    const key = req.request_purpose?.trim() || "";
    const list = groups.get(key) ?? [];
    list.push(req);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    })
    .map(([purposeKey, list]) => ({
      purposeKey,
      label: purposeKey || "No purpose assigned",
      requests: list,
    }));
}

function notifyNewMarketingRequest(requestId: string): void {
  void fetch("/api/marketing-request/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }),
  });
}

export default function MarketingPage() {
  const [session, setSession] = useState<MarketingSession | null>(null);
  const [booting, setBooting] = useState(true);

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [requests, setRequests] = useState<MarketingRequest[]>([]);
  const [dashboardRequests, setDashboardRequests] = useState<MarketingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [preferredCourier, setPreferredCourier] = useState<MarketingCourier>("Regular");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Indonesia");
  const [notes, setNotes] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [savedPurposes, setSavedPurposes] = useState<string[]>([]);
  const [items, setItems] = useState<DraftItem[]>([{ product_barcode: "", product_name: "", qty: 1 }]);

  const [activeLookupIndex, setActiveLookupIndex] = useState<number | null>(null);
  const [productHits, setProductHits] = useState<{ barcode: string; clean_name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const [entryMode, setEntryMode] = useState<"single" | "import">("single");
  const [importPreview, setImportPreview] = useState<MarketingImportPreviewRow[]>([]);
  const [importPackages, setImportPackages] = useState<ReturnType<typeof parseMarketingImportCsv>["packages"]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [portalTab, setPortalTab] = useState<"dashboard" | "submit" | "shipments" | "summary">("dashboard");
  const [viewingRequestId, setViewingRequestId] = useState<string | null>(null);
  const [openChatForRequestId, setOpenChatForRequestId] = useState<string | null>(null);

  const { totalUnread, unreadByRequestId, notifications, refreshUnread } = useMarketingChatUnread(session);

  const handleNotificationSelect = useCallback((requestId: string) => {
    setViewingRequestId(requestId);
    setOpenChatForRequestId(requestId);
  }, []);

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

  const loadRequests = useCallback(
    async (silent = false) => {
      if (!session) return;
      if (!silent) setLoadingRequests(true);
      try {
        const data = await fetchMarketingRequestsByUser(session.email);
        setRequests(data);
      } catch {
        if (!silent) setRequests([]);
      } finally {
        if (!silent) setLoadingRequests(false);
      }
    },
    [session]
  );

  const reloadSavedPurposes = useCallback(() => {
    fetchMarketingRequestPurposes()
      .then(setSavedPurposes)
      .catch(() => setSavedPurposes([]));
  }, []);

  const loadDashboardRequests = useCallback(async (silent = false) => {
    if (!silent) setLoadingDashboard(true);
    try {
      const data = await fetchAllMarketingRequestsForRegistry();
      setDashboardRequests(data);
    } catch {
      if (!silent) setDashboardRequests([]);
    } finally {
      if (!silent) setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadRequests();
    void loadDashboardRequests();
    reloadSavedPurposes();
  }, [session, loadRequests, loadDashboardRequests, reloadSavedPurposes]);

  useAutoRefresh(() => {
    void loadRequests(true);
    void loadDashboardRequests(true);
  }, 15000, !!session);

  useEffect(() => {
    if (activeLookupIndex === null) {
      setProductHits([]);
      return;
    }

    const query = items[activeLookupIndex]?.product_name.trim() ?? "";
    if (query.length < 2) {
      setProductHits([]);
      return;
    }

    const timer = setTimeout(() => {
      searchProducts(query).then(setProductHits).catch(() => setProductHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [activeLookupIndex, items]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const s = await loginMarketingUser(email, pin);
      setMarketingSession(s);
      setSession(s);
      setPin("");
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearMarketingSession();
    setSession(null);
    setRequests([]);
  };

  const addItem = () => {
    setItems((prev) => [...prev, { product_barcode: "", product_name: "", qty: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setActiveLookupIndex((current) => {
      if (current === null) return null;
      if (current === index) {
        setProductHits([]);
        return null;
      }
      return current > index ? current - 1 : current;
    });
  };

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const pickProduct = (index: number, product: { barcode: string; clean_name: string }) => {
    updateItem(index, { product_barcode: product.barcode, product_name: product.clean_name });
    setProductHits([]);
    setActiveLookupIndex(null);
  };

  const handleProductNameChange = (index: number, value: string) => {
    updateItem(index, { product_name: value });
    setActiveLookupIndex(index);
  };

  const resetForm = () => {
    setEditingId(null);
    setRecipientName("");
    setRecipientPhone("");
    setDueDate("");
    setPreferredCourier("Regular");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setState("");
    setPostalCode("");
    setCountry("Indonesia");
    setNotes("");
    setRequestPurpose("");
    setItems([{ product_barcode: "", product_name: "", qty: 1 }]);
    setActiveLookupIndex(null);
    setProductHits([]);
  };

  const loadRequestForEdit = (req: MarketingRequest) => {
    if (req.status !== "pending") return;
    setEntryMode("single");
    setEditingId(req.id);
    setSubmitError("");
    setSubmitSuccess("");
    setRecipientName(req.recipient_name);
    setRecipientPhone(req.recipient_phone ?? "");
    setDueDate(req.due_date ?? "");
    setPreferredCourier(req.preferred_courier ?? "Regular");
    setAddressLine1(req.address_line1);
    setAddressLine2(req.address_line2 ?? "");
    setCity(req.city);
    setState(req.state);
    setPostalCode(req.postal_code);
    setCountry(req.country);
    setNotes(req.notes ?? "");
    setRequestPurpose(req.request_purpose ?? "");
    setItems(
      (req.items ?? []).length > 0
        ? (req.items ?? []).map((item) => ({
            product_barcode: item.product_barcode ?? "",
            product_name: item.product_name,
            qty: item.qty,
          }))
        : [{ product_barcode: "", product_name: "", qty: 1 }]
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteRequest = async (req: MarketingRequest) => {
    if (!session) return;
    const canDelete = canDeleteMarketingShipment(session, req);
    if (!canDelete) return;

    const confirmed = window.confirm(
      `Delete request for ${req.recipient_name} (${req.barcode})?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(req.id);
    setSubmitError("");
    try {
      await deleteMarketingRequest(session, req.id);
      if (editingId === req.id) resetForm();
      if (viewingRequestId === req.id) setViewingRequestId(null);
      await loadRequests();
      if (portalTab === "shipments" || portalTab === "dashboard" || portalTab === "summary") {
        await loadDashboardRequests(true);
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to delete request");
    } finally {
      setDeletingId(null);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportSuccess("");
    setImportErrors([]);
    setImportPreview([]);
    setImportPackages([]);

    try {
      const text = await file.text();
      const result = parseMarketingImportCsv(text);
      setImportFileName(file.name);

      if (result.errors.length > 0) {
        setImportErrors(result.errors);
        return;
      }

      setImportPreview(result.preview);
      setImportPackages(result.packages);
    } catch (err: unknown) {
      setImportErrors([err instanceof Error ? err.message : "Failed to read file"]);
    }
  };

  const handleImportSubmit = async () => {
    if (!session || importPackages.length === 0) return;
    setImporting(true);
    setImportSuccess("");
    setImportErrors([]);

    try {
      const { created, errors } = await createMarketingRequestsBulk(session, importPackages);
      if (created.length > 0) {
        for (const request of created) {
          notifyNewMarketingRequest(request.id);
        }
        setImportSuccess(
          `Imported ${created.length} package${created.length === 1 ? "" : "s"} (${created.map((r) => r.barcode).join(", ")}).`
        );
        setImportPreview([]);
        setImportPackages([]);
        setImportFileName("");
        await loadRequests();
      }
      if (errors.length > 0) {
        setImportErrors(errors);
      }
      if (created.length === 0 && errors.length === 0) {
        setImportErrors(["Nothing was imported."]);
      }
    } catch (err: unknown) {
      setImportErrors([err instanceof Error ? err.message : "Import failed"]);
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitError("");
    setSubmitSuccess("");
    setSubmitting(true);

    try {
      const validItems = items.filter((item) => item.product_name.trim() && item.qty > 0);
      if (!validItems.length) throw new Error("Add at least one product with a name and quantity.");
      if (!postalCode.trim()) throw new Error("Postal / ZIP code is required.");
      if (!city.trim() || !state.trim()) {
        throw new Error("Enter a valid postal code so city and region can be filled in.");
      }

      const payload = {
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        due_date: dueDate,
        preferred_courier: preferredCourier,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state,
        postal_code: postalCode,
        country,
        notes,
        request_purpose: requestPurpose,
        items: validItems,
      };

      if (editingId) {
        const updated = await updateMarketingRequest(session, editingId, payload);
        setSubmitSuccess(`Request updated (${updated.barcode}).`);
      } else {
        const created = await createMarketingRequest(session, payload);
        notifyNewMarketingRequest(created.id);
        setSubmitSuccess(`Request submitted. Barcode ${created.barcode} — the offline team will print the shipping label.`);
      }

      resetForm();
      await loadRequests();
      reloadSavedPurposes();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const portalShipmentRequests = useMemo(() => {
    if (!session) return [];
    return buildPortalShipmentRequests(dashboardRequests, requests, session.email);
  }, [dashboardRequests, requests, session]);
  const requestsByPurpose = useMemo(() => groupRequestsByPurpose(requests), [requests]);
  const viewingRequest = useMemo(() => {
    if (!viewingRequestId) return null;
    return (
      requests.find((req) => req.id === viewingRequestId) ??
      dashboardRequests.find((req) => req.id === viewingRequestId) ??
      null
    );
  }, [requests, dashboardRequests, viewingRequestId]);
  const isWidePortal =
    portalTab === "shipments" || portalTab === "dashboard" || portalTab === "summary";
  const portalMaxWidth = isWidePortal ? "max-w-7xl" : "max-w-3xl";

  if (booting) {
    return (
      <CenteredPage>
        <Loader2 className="animate-spin w-10 h-10 text-violet-600" />
      </CenteredPage>
    );
  }

  if (!session) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-violet-700" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">Marketing Requests</h1>
            <p className="text-gray-600 mt-2 text-sm">
              Sign in with your team email and PIN. Marketing, R&amp;D, Leadership, and other divisions can submit requests here.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldInput}
                placeholder="marketing@aerisbeaute.com"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">PIN</label>
              <input
                type="password"
                required
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={fieldInput}
                placeholder="••••"
              />
            </div>
            {loginError && <p className="text-sm text-red-600 font-medium">{loginError}</p>}
            <DashButton type="submit" variant="pink" size="lg" className="w-full" disabled={loggingIn}>
              {loggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Sign In
            </DashButton>
          </form>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  if (!canAccessRequestPortal(session)) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-black text-gray-900 mb-2">Fulfillment account</h1>
          <p className="text-sm text-gray-600 mb-6">
            Your account ({roleLabel(session.role)}) is set up for the packing portal, not submitting requests.
          </p>
          <Link href="/marketing/fulfill">
            <DashButton variant="primary" size="lg">
              Go to packing portal
            </DashButton>
          </Link>
          <DashButton variant="ghost" size="sm" className="mt-4" onClick={handleLogout}>
            <LogOut className="w-4 h-4" /> Log out
          </DashButton>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div
          className={cx(
            "mx-auto px-4 py-4 flex items-center justify-between",
            portalMaxWidth
          )}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Aeris · {session.division}</p>
            <h1 className="text-xl font-black text-gray-900">Request Goods</h1>
          </div>
          <div className="flex items-center gap-3">
            <MarketingChatNotifications
              count={totalUnread}
              notifications={notifications}
              onSelectRequest={handleNotificationSelect}
            />
            <span className="text-sm text-gray-600 hidden sm:block">
              {session.displayName}
              <span className="text-gray-400"> · </span>
              {session.division}
            </span>
            <DashButton variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" /> Log out
            </DashButton>
          </div>
        </div>
      </header>

      <main
        className={cx(
          "mx-auto px-4 py-8 space-y-8",
          portalMaxWidth
        )}
      >
        <div className="flex flex-wrap gap-2 p-1 bg-gray-100 rounded-xl">
          <DashButton
            type="button"
            onClick={() => setPortalTab("dashboard")}
            className={cx(
              "flex-1 min-w-[7rem] rounded-lg px-3 py-2.5 text-sm font-bold transition inline-flex items-center justify-center gap-1.5",
              portalTab === "dashboard" ? "bg-white shadow-sm text-violet-700" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            Dashboard
          </DashButton>
          <DashButton
            type="button"
            onClick={() => setPortalTab("summary")}
            className={cx(
              "flex-1 min-w-[7rem] rounded-lg px-3 py-2.5 text-sm font-bold transition inline-flex items-center justify-center gap-1.5",
              portalTab === "summary" ? "bg-white shadow-sm text-violet-700" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <TableProperties className="w-4 h-4 shrink-0" />
            Summary
          </DashButton>
          <DashButton
            type="button"
            onClick={() => setPortalTab("submit")}
            className={cx(
              "flex-1 min-w-[7rem] rounded-lg px-3 py-2.5 text-sm font-bold transition",
              portalTab === "submit" ? "bg-white shadow-sm text-violet-700" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Submit
          </DashButton>
          <DashButton
            type="button"
            onClick={() => setPortalTab("shipments")}
            className={cx(
              "flex-1 min-w-[7rem] rounded-lg px-3 py-2.5 text-sm font-bold transition inline-flex items-center justify-center gap-1.5",
              portalTab === "shipments" ? "bg-white shadow-sm text-violet-700" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <List className="w-4 h-4 shrink-0" />
            Shipments ({portalShipmentRequests.length})
          </DashButton>
        </div>

        {portalTab === "dashboard" ? (
          <MarketingDashboard
            requests={dashboardRequests}
            loading={loadingDashboard}
            session={session}
            onViewRequest={setViewingRequestId}
          />
        ) : portalTab === "shipments" ? (
          <MarketingPortalShipmentsPanel
            requests={portalShipmentRequests}
            loading={loadingDashboard}
            session={session}
            onViewRequest={setViewingRequestId}
            onUpdated={() => {
              void loadRequests(true);
              void loadDashboardRequests(true);
            }}
          />
        ) : portalTab === "summary" ? (
          <MarketingSummaryPanel
            requests={dashboardRequests}
            loading={loadingDashboard}
            onViewRequest={setViewingRequestId}
          />
        ) : (
        <>
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
          <DashButton
            type="button"
            onClick={() => {
              if (entryMode !== "single" && editingId) resetForm();
              setEntryMode("single");
            }}
            className={cx(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition",
              entryMode === "single" ? "bg-white shadow-sm text-violet-700" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Single request
          </DashButton>
          <DashButton
            type="button"
            onClick={() => {
              if (entryMode !== "import" && editingId) resetForm();
              setEntryMode("import");
            }}
            className={cx(
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition",
              entryMode === "import" ? "bg-white shadow-sm text-violet-700" : "text-gray-600 hover:text-gray-900"
            )}
          >
            Bulk import
          </DashButton>
        </div>

        {entryMode === "import" ? (
          <SurfaceCard className="p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Import multiple packages</h2>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV with one row per item. Rows sharing the same{" "}
              <span className="font-mono font-semibold">package_id</span> become one shipment with multiple
              products. Use <span className="font-mono font-semibold">request_purpose</span> for internal
              event/campaign tracking (not printed on labels).
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
              <DashButton type="button" variant="subtle" size="md" onClick={downloadMarketingImportTemplate}>
                <Download className="w-4 h-4" /> Download template
              </DashButton>
              <a href="/marketing-import-template.csv" download className="inline-flex">
                <DashButton type="button" variant="secondary" size="md">
                  <FileSpreadsheet className="w-4 h-4" /> Template file
                </DashButton>
              </a>
            </div>

            <div className="border-2 border-dashed border-violet-200 bg-violet-50/40 rounded-xl p-8 text-center relative mb-6">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleImportFile}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <UploadCloud className="w-10 h-10 text-violet-600 mx-auto mb-3" />
              <p className="font-semibold text-gray-800">Click or drag a CSV file here</p>
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

            {importPreview.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase text-gray-700 mb-3">
                  Preview — {importPreview.length} package{importPreview.length === 1 ? "" : "s"}
                </h3>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-bold uppercase text-gray-600">
                      <tr>
                        <th className="px-4 py-3">Package ID</th>
                        <th className="px-4 py-3">Recipient</th>
                        <th className="px-4 py-3">Purpose</th>
                        <th className="px-4 py-3">Courier</th>
                        <th className="px-4 py-3">Due</th>
                        <th className="px-4 py-3 text-right">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((row) => (
                        <tr key={row.packageId} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-mono font-semibold text-gray-900">{row.packageId}</td>
                          <td className="px-4 py-3 text-gray-800">{row.recipientName}</td>
                          <td className="px-4 py-3 text-violet-800 text-xs font-semibold max-w-[160px] truncate">
                            {row.purpose ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.courier}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {new Date(row.dueDate + "T12:00:00").toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{row.itemCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importSuccess && (
              <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            <DashButton
              type="button"
              variant="pink"
              size="lg"
              className="w-full"
              disabled={importing || importPackages.length === 0}
              onClick={handleImportSubmit}
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Import {importPackages.length > 0 ? `${importPackages.length} package${importPackages.length === 1 ? "" : "s"}` : "packages"}
            </DashButton>
          </SurfaceCard>
        ) : (
        <SurfaceCard className="p-6">
          {editingId ? (
            <div className="mb-6 flex items-start justify-between gap-3 p-4 rounded-xl bg-violet-50 border border-violet-200">
              <div>
                <h2 className="text-lg font-bold text-violet-900">Edit request</h2>
                <p className="text-sm text-violet-800 mt-1">Changes apply to this pending shipment only.</p>
              </div>
              <DashButton type="button" variant="ghost" size="sm" onClick={resetForm}>
                <X className="w-4 h-4" /> Cancel
              </DashButton>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-1">New shipment request</h2>
              <p className="text-sm text-gray-600 mb-6">
                Submit recipient details and items. The offline team receives a printable label with address, packing list, and scan barcode.
              </p>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <section>
              <h3 className="text-xs font-bold uppercase text-gray-700 mb-1">Event / purpose</h3>
              <p className="text-xs text-gray-500 mb-3">Internal only — not printed on shipping labels.</p>
              <div className="grid gap-3">
                <MarketingSavedPurposesManager
                  purposes={savedPurposes}
                  session={session}
                  onUpdated={reloadSavedPurposes}
                  onSelect={setRequestPurpose}
                />
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {savedPurposes.length > 0 ? "Or enter event / purpose" : "Event / purpose"}
                  </label>
                  <input
                    value={requestPurpose}
                    onChange={(e) => setRequestPurpose(e.target.value)}
                    placeholder="e.g. TikTok creator seeding — Q2 launch"
                    list="marketing-purpose-suggestions"
                    className={fieldInput}
                  />
                  <datalist id="marketing-purpose-suggestions">
                    {savedPurposes.map((purpose) => (
                      <option key={purpose} value={purpose} />
                    ))}
                  </datalist>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase text-gray-700 mb-3">Ship to</h3>
              <div className="grid gap-3">
                <input required value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient name" className={fieldInput} />
                <input
                  required
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="Recipient phone number"
                  className={fieldInput}
                />
                <MarketingAddressFields
                  key={editingId ?? "new"}
                  country={country}
                  postalCode={postalCode}
                  city={city}
                  state={state}
                  onCountryChange={setCountry}
                  onPostalCodeChange={setPostalCode}
                  onCityChange={setCity}
                  onStateChange={setState}
                  fieldInput={fieldInput}
                />
                <input required value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address line 1" className={fieldInput} />
                <input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Address line 2 (optional)" className={fieldInput} />
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase text-gray-700 mb-3">Delivery</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Due date</label>
                  <input
                    required
                    type="date"
                    value={dueDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={fieldInput}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Preferred courier</label>
                  <select
                    required
                    value={preferredCourier}
                    onChange={(e) => setPreferredCourier(e.target.value as MarketingCourier)}
                    className={fieldInput}
                  >
                    {MARKETING_COURIER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase text-gray-700">Items to pack</h3>
                <DashButton type="button" variant="subtle" size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4" /> Add item
                </DashButton>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex gap-2 mb-2">
                      <div className="flex-1 relative min-w-0">
                        <input
                          value={item.product_name}
                          onChange={(e) => handleProductNameChange(index, e.target.value)}
                          onFocus={() => setActiveLookupIndex(index)}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setActiveLookupIndex((current) => (current === index ? null : current));
                            }, 150);
                          }}
                          placeholder="Product name — type to search SKU or enter freely"
                          required
                          autoComplete="off"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none"
                        />
                        {activeLookupIndex === index && productHits.length > 0 && (
                          <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                            {productHits.map((hit) => (
                              <li key={hit.barcode}>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => pickProduct(index, hit)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50"
                                >
                                  <span className="font-medium">{hit.clean_name}</span>
                                  <span className="text-gray-600 ml-2 font-mono text-xs">{hit.barcode}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => updateItem(index, { qty: Number(e.target.value) || 1 })}
                        className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 text-center shrink-0"
                      />
                      {items.length > 1 && (
                        <DashButton type="button" variant="danger" size="sm" onClick={() => removeItem(index)}>
                          <Trash2 className="w-4 h-4" />
                        </DashButton>
                      )}
                    </div>
                    <input
                      value={item.product_barcode}
                      onChange={(e) => updateItem(index, { product_barcode: e.target.value })}
                      placeholder="Barcode / SKU (optional — filled when you pick from search)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-800"
                    />
                  </div>
                ))}
              </div>
            </section>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Notes for offline team</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Gift wrap, influencer campaign, urgency, etc."
                className={`${fieldInput} resize-none`}
              />
            </div>

            {submitError && <p className="text-sm text-red-600 font-medium">{submitError}</p>}
            {submitSuccess && (
              <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{submitSuccess}</span>
              </div>
            )}

            <DashButton type="submit" variant="pink" size="lg" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Pencil className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {editingId ? "Save changes" : "Submit to offline team"}
            </DashButton>
          </form>
        </SurfaceCard>
        )}

        {submitError && entryMode === "import" && (
          <p className="text-sm text-red-600 font-medium px-1">{submitError}</p>
        )}

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Your requests</h2>
          <p className="text-sm text-gray-600 mb-4">
            Click any request to view full details. Pending requests can be edited or deleted before the offline team packs them.
          </p>
          {loadingRequests ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin w-8 h-8 text-gray-600" />
            </div>
          ) : requests.length === 0 ? (
            <SurfaceCard className="p-8 text-center text-gray-600 text-sm">No requests yet.</SurfaceCard>
          ) : (
            <>
              <MarketingPurposeSummary groups={requestsByPurpose} />
              <div className="space-y-8">
                {requestsByPurpose.map((group) => (
                  <div key={group.purposeKey || "__none__"}>
                    <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
                      <h3 className="text-sm font-black text-violet-900">{group.label}</h3>
                      <span className="text-xs font-semibold text-gray-500 tabular-nums shrink-0">
                        {group.requests.length} shipment{group.requests.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {group.requests.map((req) => {
                const isViewing = viewingRequestId === req.id;
                const isHistorical = req.status !== "pending";

                return (
                <SurfaceCard
                  key={req.id}
                  className={cx(
                    "p-4",
                    editingId === req.id && "ring-2 ring-violet-400 border-violet-200",
                    isViewing && "ring-2 ring-violet-300 border-violet-200"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setViewingRequestId(req.id)}
                    className={cx(
                      "w-full text-left rounded-lg -m-1 p-1 transition",
                      isHistorical ? "cursor-pointer hover:bg-gray-50/80" : "cursor-pointer hover:bg-violet-50/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">{req.recipient_name}</p>
                        <p className="text-sm text-gray-600">
                          {req.city}, {req.country} · {req.items?.length ?? 0} item(s)
                        </p>
                        {(req.due_date || req.preferred_courier) && (
                          <p className="text-sm text-gray-700 mt-1">
                            {req.preferred_courier && <span className="font-semibold">{req.preferred_courier}</span>}
                            {req.preferred_courier && req.due_date && " · "}
                            {req.due_date && (
                              <span>Due {new Date(req.due_date + "T12:00:00").toLocaleDateString()}</span>
                            )}
                          </p>
                        )}
                        <p className="text-xs font-mono text-gray-600 mt-1">{req.barcode}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={req.status} />
                        <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        {req.status === "shipped" ? <Truck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {new Date(req.created_at).toLocaleString()}
                      </p>
                      {isHistorical && (
                        <span className="text-xs font-semibold text-violet-600">View details</span>
                      )}
                    </div>
                  </button>
                  {req.status === "pending" && (
                    <div className="mt-3 flex justify-end gap-2">
                      <DashButton
                        type="button"
                        variant="subtle"
                        size="sm"
                        onClick={() => loadRequestForEdit(req)}
                        disabled={deletingId === req.id}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </DashButton>
                      <DashButton
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteRequest(req)}
                        disabled={deletingId === req.id}
                      >
                        {deletingId === req.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Delete
                      </DashButton>
                    </div>
                  )}
                  <RequestChat
                    requestId={req.id}
                    packageLabel={`${req.recipient_name} · ${req.barcode}`}
                    session={session}
                    unreadCount={unreadByRequestId[req.id] ?? 0}
                    onRead={refreshUnread}
                  />
                </SurfaceCard>
              );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        </>
        )}
      </main>

      {viewingRequest && (
        <MarketingRequestDetailModal
          request={viewingRequest}
          onClose={() => {
            setViewingRequestId(null);
            setOpenChatForRequestId(null);
          }}
          session={session}
          defaultOpenChat={openChatForRequestId === viewingRequest.id}
          unreadCount={unreadByRequestId[viewingRequest.id] ?? 0}
          onRead={refreshUnread}
          onDelete={
            canDeleteMarketingShipment(session, viewingRequest)
              ? () => handleDeleteRequest(viewingRequest)
              : undefined
          }
          deleting={deletingId === viewingRequest.id}
        />
      )}
    </div>
  );
}
