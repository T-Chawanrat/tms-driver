import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ScanLine, Search } from "lucide-react";
import CameraScannerModal from "../components/camera/CameraScannerModal";
import AxiosInstance from "../services/http";
import { preventSpaceKey, removeSpaces } from "../utils/textSanitizer";

type Item = { serial_id: string; serial_no: string };
type Details = {
  truck_code: string | null;
  receive_code: string | null;
  license_plate: string | null;
  route_code: string | null;
  route_name: string | null;
};

export default function PickupScan() {
  const { truckId } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState<Details | null>(null);
  const [pending, setPending] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scanError, setScanError] = useState("");
  const [serial, setSerial] = useState("");
  const [activeList, setActiveList] = useState<"loaded" | "pending">("loaded");
  const [scanMode, setScanMode] = useState<"LOAD" | "UNLOAD">("LOAD");
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const base = `/driver/pickups/trucks/${encodeURIComponent(truckId || "")}`;
  const loadProducts = useCallback(async () => {
    const { data } = await AxiosInstance.get<{ data: Item[]; loaded: Item[] }>(`${base}/products`);
    setPending(data.data || []);
    setLoaded(data.loaded || []);
  }, [base]);

  useEffect(() => {
    if (!truckId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([AxiosInstance.get<{ data: Details }>(base), AxiosInstance.get<{ data: Item[]; loaded: Item[] }>(`${base}/products`)])
      .then(([truck, products]) => {
        if (active) {
          setDetails(truck.data.data);
          setPending(products.data.data || []);
          setLoaded(products.data.loaded || []);
        }
      })
      .catch(() => {
        if (active) setError("ไม่สามารถโหลดงานเข้ารับได้");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [truckId, base]);

  const submitSerial = async (value: string) => {
    const serialNo = removeSpaces(value);
    if (!serialNo || !truckId || busy.current) return;
    busy.current = true;
    setSaving(true);
    setScanError("");
    try {
      await AxiosInstance.post(`${base}/${scanMode === "LOAD" ? "load-product" : "unload-product"}`, { serial_no: serialNo });
      setSerial("");
      try {
        await loadProducts();
      } catch {
        setScanError("บันทึกสำเร็จ แต่โหลดรายการใหม่ไม่สำเร็จ กรุณารีเฟรชหน้า");
      }
      input.current?.focus();
    } catch (exception: any) {
      setScanError(exception.response?.data?.message || "ไม่สามารถบันทึกรายการได้");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const list = activeList === "loaded" ? loaded : pending;
  return (
    <>
      <section className="flex w-full flex-col gap-4 px-4 pb-24 pt-5 sm:px-6">
        {!truckId ? (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-slate-500">กรุณาเลือกใบรถก่อนเริ่มสแกน</p>
        ) : loading ? (
          <p className="p-4 text-center text-slate-500">กำลังโหลดข้อมูลใบรถ...</p>
        ) : error || !details ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
            {error || "ไม่พบข้อมูลใบรถ"}
          </p>
        ) : (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-blue-600 p-5 text-white shadow-xl shadow-blue-600/20">
              <div className="flex items-center justify-between">
                <div>
                  <small className="text-sm font-semibold text-blue-100">ใบรถเข้ารับ</small>
                  <p className="text-lg font-bold">สแกนขึ้นรถแล้ว</p>
                </div>
                <strong className="text-4xl">
                  {loaded.length} <small>SN</small>
                </strong>
              </div>
              <div className="mt-4 grid gap-1.5 border-t border-white/20 pt-3 text-sm font-semibold">
                <p>เลขใบรถ: {details.truck_code || "-"}</p>
                <p>เลขบิล: {details.receive_code || "-"}</p>
                <p>ทะเบียนรถ: {details.license_plate || "-"}</p>
                <p>สายรถ: {[details.route_code, details.route_name].filter(Boolean).join(" - ") || "-"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setScanMode("LOAD")}
                className={`h-11 rounded-xl font-bold ${scanMode === "LOAD" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
              >
                ยิงขึ้นรถ
              </button>
              <button
                type="button"
                onClick={() => setScanMode("UNLOAD")}
                className={`h-11 rounded-xl font-bold ${scanMode === "UNLOAD" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}
              >
                ยิงลบ
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitSerial(serial);
              }}
              className={`flex min-h-[76px] items-center gap-2 rounded-3xl border bg-white p-2 shadow-sm ${scanMode === "LOAD" ? "border-blue-100" : "border-orange-100"}`}
            >
              <input
                ref={input}
                value={serial}
                onChange={(event) => setSerial(removeSpaces(event.target.value))}
                onKeyDown={preventSpaceKey}
                placeholder={scanMode === "LOAD" ? "ยิงหรือพิมพ์ Serial No" : "ยิงลบหรือพิมพ์ Serial No"}
                aria-label="Serial No"
                className="min-w-0 flex-1 border-0 bg-transparent px-3 text-[15px] outline-none"
              />
              <button
                disabled={saving}
                aria-label="ยิง SN"
                className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white disabled:bg-slate-300 ${scanMode === "LOAD" ? "bg-blue-600" : "bg-orange-600"}`}
              >
                <Search size={25} />
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setCameraOpen(true)}
                aria-label="เปิดกล้อง"
                className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl disabled:opacity-50 ${scanMode === "UNLOAD" ? "bg-orange-100 text-orange-700 active:bg-orange-200" : "bg-blue-100 text-blue-700 active:bg-blue-200"}`}
              >
                <ScanLine size={27} />
              </button>
            </form>
            {scanError && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {scanError}
              </p>
            )}
            <button
              type="button"
              disabled={!loaded.length || !!pending.length || saving}
              onClick={() => navigate(`/pickup-trucks/${truckId}/close`)}
              className="h-12 rounded-2xl border border-blue-200 bg-blue-50 font-bold text-blue-700 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              ปิดบรรทุก
            </button>
            {pending.length > 0 && loaded.length > 0 && <p className="text-sm text-slate-500">ยังไม่รองรับการปิดบรรทุกบางส่วน</p>}
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
              {(["loaded", "pending"] as const).map((key) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setActiveList(key)}
                  className={`h-11 rounded-xl font-bold ${activeList === key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                >
                  {key === "loaded" ? `บนรถแล้ว ${loaded.length}` : `รอยิง ${pending.length}`}
                </button>
              ))}
            </div>
            <h2 className="font-bold text-slate-900">{activeList === "loaded" ? "SN บนรถแล้ว" : "SN รอยิง"}</h2>
            {list.length ? (
              list.map((item) => (
                <div
                  key={`${item.serial_id}-${item.serial_no}`}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                >
                  <span className={`h-2 w-2 rounded-full ${activeList === "loaded" ? "bg-emerald-500" : "bg-orange-500"}`} />
                  <code>{item.serial_no}</code>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">ไม่มีรายการ</p>
            )}
          </>
        )}
      </section>
      <CameraScannerModal
        open={cameraOpen}
        title="สแกนบาร์โค้ด"
        guide="จัดบาร์โค้ดให้อยู่ในกรอบ"
        showFrame
        onClose={() => setCameraOpen(false)}
        onScan={(value) => void submitSerial(value)}
      />
    </>
  );
}
