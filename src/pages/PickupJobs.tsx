import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Package, Route, Warehouse } from "lucide-react";
import { useDriverAuth } from "../context/AuthContext";
import AxiosInstance from "../services/http";
import ConfirmModal from "../components/ConfirmModal";

type PickupRoute = { route_id: number | null; route_code: string | null; route_name: string | null; total_boxes: number };
type StopRow = {
  source_type: string | null;
  receive_id: number | null;
  receive_code: string | null;
  pickup_name: string | null;
  pickup_address: string | null;
  pickup_phone: string | null;
  subdistrict_name: string | null;
  district_name: string | null;
  province_name: string | null;
  serial_id: number;
  serial_no: string;
};

function PickupStops({ routeId, onAccepted }: { routeId: string; onAccepted: () => void }) {
  const [rows, setRows] = useState<StopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const [activeStop, setActiveStop] = useState<string | null>(null);
  const [options, setOptions] = useState<{ driver_type: string; vehicles: { id: number; license_plate: string; license_plate_province?: string }[]; contractor_vehicle?: { license_plate: string } | null } | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setRows([]);
    setLoading(true);
    setError("");
    AxiosInstance.get<{ data: StopRow[] }>("/driver/pickups/stops", { params: { route_id: routeId } })
      .then(({ data }) => {
        if (active) setRows(data.data || []);
      })
      .catch(() => {
        if (active) setError("ไม่สามารถโหลดจุดรับได้");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [routeId, refresh]);
  const stops = new Map<string, { name: string; address: string; phone: string; bills: Map<string, { code: string; serials: Set<string> }> }>();
  for (const row of rows) {
    const address = [row.pickup_address, row.subdistrict_name, row.district_name, row.province_name].filter(Boolean).join(" ");
    const billKey = `${row.source_type ?? "unknown"}-${row.receive_id ?? row.serial_id}`;
    const key = row.pickup_name && address ? JSON.stringify([row.pickup_name, address, row.pickup_phone]) : `unknown-${billKey}`;
    if (!stops.has(key))
      stops.set(key, {
        name: row.pickup_name || "ไม่พบชื่อจุดรับ",
        address: address || "ไม่พบที่อยู่ กรุณาติดต่อคลัง",
        phone: row.pickup_phone || "",
        bills: new Map(),
      });
    const stop = stops.get(key)!;
    if (!stop.bills.has(billKey)) stop.bills.set(billKey, { code: row.receive_code || "ไม่พบเลขที่บิล", serials: new Set() });
    stop.bills.get(billKey)!.serials.add(row.serial_no);
  }
  if (loading) return <p className="text-center text-sm text-slate-500">กำลังโหลดจุดรับ...</p>;
  if (error)
    return (
      <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
        {error}
      </p>
    );
  if (!stops.size) return <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">ไม่พบจุดรับในสายนี้</p>;
  const openAccept = async (key: string) => {
    try {
      setError("");
      setSaving(true);
      const { data } = await AxiosInstance.get("/driver/pickups/options");
      if (data.data?.driver_type === "CONTRACTOR") {
        await accept(key, null);
        return;
      }
      setOptions(data.data);
      setVehicleId("");
      setActiveStop(key);
    } catch { setError("ไม่สามารถโหลดข้อมูลรถได้"); }
    finally { setSaving(false); }
  };
  const accept = async (stopKey: string, chosenVehicle: string | null) => {
    const stop = stops.get(stopKey);
    if (!stop) return;
    const bills = Array.from(stop.bills.keys()).filter((key) => selectedBills.has(key)).map((key) => {
      const [source_type, receiveId] = key.split("-");
      return { source_type, receive_id: Number(receiveId) };
    });
    try {
      setSaving(true);
      await AxiosInstance.post("/driver/pickups/accept", { route_id: routeId, vehicle_id: chosenVehicle ? Number(chosenVehicle) : null, bills });
      setActiveStop(null); setSelectedBills(new Set()); setRefresh((value) => value + 1); onAccepted();
    } catch (exception: any) { alert(exception.response?.data?.message || "ไม่สามารถรับงานได้"); }
    finally { setSaving(false); }
  };
  return (
    <div className="grid gap-3">
      <h2 className="font-bold text-slate-900">จุดรับสินค้า ({stops.size})</h2>
      {Array.from(stops.entries()).map(([key, stop]) => (
        <article key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <MapPin size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-900">{stop.name}</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">{stop.address}</p>
              {stop.phone && (
                <a href={`tel:${stop.phone}`} className="mt-1 inline-block text-sm font-semibold text-blue-700">
                  โทร {stop.phone}
                </a>
              )}
            </div>
            <button type="button" onClick={() => void openAccept(key)} disabled={saving || !Array.from(stop.bills.keys()).some((billKey) => selectedBills.has(billKey))} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:bg-blue-50 disabled:text-blue-300">รับงาน</button>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {Array.from(stop.bills.entries()).map(([billKey, bill]) => (
              <div key={billKey} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <input type="checkbox" aria-label={`เลือก ${bill.code}`} checked={selectedBills.has(billKey)} onChange={(event) => { const checked = event.target.checked; setSelectedBills((current) => { const next = new Set(current); if (checked) next.add(billKey); else next.delete(billKey); return next; }); }} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                <details className="min-w-0 flex-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-800">{bill.code}</span>
                  <span className="whitespace-nowrap font-bold text-blue-700">{bill.serials.size} กล่อง ▾</span>
                </summary>
                <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                  {Array.from(bill.serials).map((serial) => (
                    <p key={serial} className="break-all text-sm text-slate-600">
                      {serial}
                    </p>
                  ))}
                </div>
                </details>
              </div>
            ))}
          </div>
        </article>
      ))}
      <ConfirmModal open={activeStop !== null} title="ยืนยันรับงาน" confirmLabel="รับงาน" animateOnOpen disabled={saving} confirmDisabled={!vehicleId} onCancel={() => setActiveStop(null)} onConfirm={() => { if (activeStop) void accept(activeStop, vehicleId); }}>
        <label className="mt-4 block text-sm font-semibold">ทะเบียนรถ<select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-2"><option value="">เลือกทะเบียนรถ</option>{options?.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{[vehicle.license_plate, vehicle.license_plate_province].filter(Boolean).join(" ")}</option>)}</select></label>
      </ConfirmModal>
    </div>
  );
}

export default function PickupJobs() {
  const { driver } = useDriverAuth();
  const [routes, setRoutes] = useState<PickupRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshRoutes, setRefreshRoutes] = useState(0);
  useEffect(() => {
    let current = true;
    AxiosInstance.get<{ routes: PickupRoute[] }>("/driver/pickups/products")
      .then(({ data }) => {
        if (current) setRoutes(data.routes || []);
      })
      .catch(() => {
        if (current) setError("ไม่สามารถโหลดสายรถได้ กรุณาลองใหม่อีกครั้ง");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [refreshRoutes]);
  const total = routes.reduce((sum, route) => sum + Number(route.total_boxes), 0);
  return (
    <section className="flex flex-col gap-5 px-4 pb-24 pt-5 sm:px-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">งานเข้ารับสินค้า</h1>
      </div>
      <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-xl shadow-blue-600/20">
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-100">
          <Warehouse size={17} /> คลังสังกัด
        </p>
        <p className="mt-1 text-lg font-bold">{driver?.warehouse_name || "ไม่ระบุคลัง"}</p>
        <div className="mt-4 flex items-end justify-between border-t border-white/20 pt-4">
          <div>
            <p className="text-sm text-blue-100">สินค้าทั้งหมดในรายการ</p>
            <p className="mt-1 text-3xl font-bold">
              {loading ? "–" : total} <span className="text-sm font-semibold">กล่อง</span>
            </p>
          </div>
          <Package className="text-blue-200" size={30} />
        </div>
      </div>
      <div>
        <h2 className="font-bold text-slate-900">เลือกสายรถ</h2>
      </div>
      {loading ? (
        <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">กำลังโหลดสายรถ...</p>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : !routes.length ? (
        <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">ไม่พบสินค้าเข้ารับในคลัง</p>
      ) : (
        <div className="grid gap-3">
          {routes.map((route) => {
            const key = route.route_id === null ? "unassigned" : String(route.route_id);
            const name = route.route_id === null ? "ไม่ระบุสายรถ" : route.route_name || `สาย ${route.route_id}`;
            return (
              <div key={key} className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setSelected((current) => (current === key ? null : key))}
                  aria-expanded={selected === key}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm ${selected === key ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 bg-white"}`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700">
                    <Route size={21} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900">{name}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <MapPin size={13} />
                      {route.route_code || "ไม่มีรหัสสาย"}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-sm font-bold text-blue-700">{route.total_boxes} กล่อง</span>
                </button>
                {selected === key && <PickupStops routeId={key} onAccepted={() => setRefreshRoutes((value) => value + 1)} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
