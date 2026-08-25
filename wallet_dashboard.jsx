import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Copy, Share2, X, ChevronRight, ChevronLeft, Printer, CalendarDays, Users, ScrollText, ArrowRightLeft, Minus, Pencil, Check, Lock, LogIn, LogOut, Settings, UploadCloud, DownloadCloud, Github } from "lucide-react";

const STORAGE_KEY = "hoq-wallet-data-v2";
const ADMIN_DEVICE_KEY = "hoq-wallet-admin-device";
const GH_CONFIG_KEY = "hoq-wallet-gh-config";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const MONTHS_SHORT = ["ينا","فبر","مار","أبر","ماي","يون","يول","أغس","سبت","أكت","نوف","ديس"];

const DEFAULT_MESSAGE_TEMPLATE = `سلام عليكم ورحمة الله وبركاته
تذكير بمحفظة الادخار الشهرية 💰
حان موعد إيداع مساهمة شهر {الشهر} {السنة}، الرجاء التكرم بالإيداع قبل نهاية الشهر.

المبلغ المطلوب لكل عضو: {المبلغ_الشهري} ريال

اسم الحساب:- {اسم_الحساب}
رقم الحساب :- {رقم_الحساب}
الرصيد الحالي *{الرصيد}* ريال

بارك الله فيكم ونفع بكم 🌿`;

const DEFAULT_DATA = {
  accountName: "BAKHIT ALI MOHAMMED AL MAASHANI",
  accountNumber: "0398043661180027",
  openingBalance: 735,
  monthlyDue: 10,
  selectedYear: 2026,
  selectedMonthIndex: 7,
  adminPasswordHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9", // كلمة المرور الافتراضية: admin123
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
  members: [
    { id: "m1", name: "سعيد سالم", arrears: 0, payments: {} },
    { id: "m2", name: "سالم سعيد", arrears: 0, payments: {} },
    { id: "m3", name: "بخيت علي", arrears: 0, payments: {} },
    { id: "m4", name: "سعيد علي", arrears: 0, payments: { "2026-7": 10 } },
    { id: "m5", name: "محمد سالم", arrears: 0, payments: { "2026-7": 10 } },
    { id: "m6", name: "احمد سالم", arrears: 0, payments: { "2026-7": 10, "2026-8": 10 } },
    { id: "m7", name: "سالم علي", arrears: -30, payments: {} },
    { id: "m8", name: "محمد علي", arrears: -80, payments: {} },
  ],
  withdrawals: [],
};

function migrateData(parsed) {
  if (parsed && parsed.openingBalance === undefined && parsed.balance !== undefined) {
    const totalPayments = (parsed.members || []).reduce(
      (s, m) => s + Object.values(m.payments || {}).reduce((ss, v) => ss + Number(v || 0), 0),
      0
    );
    const totalWithdrawals = (parsed.withdrawals || []).reduce((s, w) => s + Number(w.amount || 0), 0);
    parsed.openingBalance = parsed.balance - totalPayments + totalWithdrawals;
    delete parsed.balance;
  }
  return parsed;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function fmt(n) {
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toLocaleString("ar-OM");
}
function mKey(year, monthIndex) {
  return `${year}-${monthIndex}`;
}
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function WalletDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("home");
  const [addingMember, setAddingMember] = useState(false);
  const [newName, setNewName] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wDate, setWDate] = useState("");
  const [wReason, setWReason] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [wParticipants, setWParticipants] = useState([]);
  const [editWithdrawId, setEditWithdrawId] = useState(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [toast, setToast] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [statsYear, setStatsYear] = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginPass, setLoginPass] = useState("");
  const [loginConfirm, setLoginConfirm] = useState("");
  const [loginError, setLoginError] = useState("");
  const [forgotPassConfirm, setForgotPassConfirm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [ghGistId, setGhGistId] = useState("");
  const [gistBusy, setGistBusy] = useState(false);
  const fileInputRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = migrateData(JSON.parse(res.value));
          setData(parsed);
          setStatsYear(parsed.selectedYear);
        } else {
          setData(DEFAULT_DATA);
          setStatsYear(DEFAULT_DATA.selectedYear);
        }
      } catch (e) {
        setData(DEFAULT_DATA);
        setStatsYear(DEFAULT_DATA.selectedYear);
      } finally {
        setLoading(false);
      }
      try {
        const dev = await window.storage.get(ADMIN_DEVICE_KEY, false);
        if (dev && dev.value === "1") setIsAdmin(true);
      } catch (e) {}
      try {
        const gh = await window.storage.get(GH_CONFIG_KEY, false);
        if (gh && gh.value) {
          const parsedGh = JSON.parse(gh.value);
          setGhToken(parsedGh.token || "");
          setGhGistId(parsedGh.gistId || "");
        }
      } catch (e) {}
    })();
  }, []);

  const persist = useCallback((next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      } catch (e) {
        console.error("فشل الحفظ", e);
      }
    }, 300);
  }, []);

  const update = (fn) => {
    setData((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      persist(next);
      return next;
    });
  };

  const flashToast = (msg, duration = 2200) => {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  };

  const requireAdmin = () => {
    if (!isAdmin) {
      flashToast("سجّل دخول الإدارة أولاً للتعديل");
      setLoginOpen(true);
      return false;
    }
    return true;
  };

  async function persistGhConfig(token, gistId) {
    try {
      await window.storage.set(GH_CONFIG_KEY, JSON.stringify({ token, gistId }), false);
    } catch (e) {}
  }

  async function handleLogin() {
    setLoginError("");
    if (!data.adminPasswordHash) {
      if (!loginPass || loginPass.length < 4) {
        setLoginError("كلمة المرور يجب أن تكون 4 أحرف/أرقام على الأقل");
        return;
      }
      if (loginPass !== loginConfirm) {
        setLoginError("كلمتا المرور غير متطابقتين");
        return;
      }
      const hash = await sha256(loginPass);
      update((prev) => ({ ...prev, adminPasswordHash: hash }));
      setIsAdmin(true);
      if (rememberDevice) await window.storage.set(ADMIN_DEVICE_KEY, "1", false);
      setLoginOpen(false);
      setLoginPass("");
      setLoginConfirm("");
      flashToast("تم إنشاء كلمة مرور الإدارة وتسجيل الدخول");
      return;
    }
    const hash = await sha256(loginPass);
    if (hash === data.adminPasswordHash) {
      setIsAdmin(true);
      if (rememberDevice) await window.storage.set(ADMIN_DEVICE_KEY, "1", false);
      setLoginOpen(false);
      setLoginPass("");
      flashToast("تم تسجيل دخول الإدارة");
    } else {
      setLoginError("كلمة المرور غير صحيحة");
    }
  }

  async function handleLogout() {
    setIsAdmin(false);
    try {
      await window.storage.delete(ADMIN_DEVICE_KEY, false);
    } catch (e) {}
    flashToast("تم تسجيل الخروج");
  }

  async function resetAdminPassword() {
    update((prev) => ({ ...prev, adminPasswordHash: null }));
    setIsAdmin(false);
    try {
      await window.storage.delete(ADMIN_DEVICE_KEY, false);
    } catch (e) {}
    setForgotPassConfirm(false);
    setLoginPass("");
    setLoginConfirm("");
    setLoginError("");
    flashToast("تمت إزالة كلمة المرور الحالية، أنشئ كلمة مرور جديدة الآن");
  }

  async function handleChangePassword() {
    const oldHash = await sha256(oldPass);
    if (oldHash !== data.adminPasswordHash) {
      flashToast("كلمة المرور الحالية غير صحيحة");
      return;
    }
    if (!newPass || newPass.length < 4) {
      flashToast("كلمة المرور الجديدة قصيرة جدًا");
      return;
    }
    if (newPass !== newPass2) {
      flashToast("كلمتا المرور الجديدتان غير متطابقتين");
      return;
    }
    const hash = await sha256(newPass);
    update((prev) => ({ ...prev, adminPasswordHash: hash }));
    setChangePassOpen(false);
    setOldPass("");
    setNewPass("");
    setNewPass2("");
    flashToast("تم تغيير كلمة مرور الإدارة");
  }

  async function exportLocalData() {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flashToast("تم تنزيل نسخة احتياطية من البيانات");
    } catch (e) {
      flashToast("تعذر إنشاء ملف النسخة الاحتياطية");
    }
  }

  function triggerImportFile() {
    if (!requireAdmin()) return;
    fileInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = migrateData(JSON.parse(reader.result));
        if (!parsed.members) throw new Error("bad shape");
        update(() => parsed);
        setStatsYear(parsed.selectedYear);
        flashToast("تم استيراد البيانات بنجاح");
      } catch (err) {
        flashToast("ملف غير صالح، تأكد أنه نسخة احتياطية صحيحة");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function saveToGist() {
    if (!requireAdmin()) return;
    if (!ghToken.trim()) {
      flashToast("أدخل GitHub Token أولاً");
      return;
    }
    setGistBusy(true);
    try {
      const body = {
        description: `نسخة احتياطية محفظة الادخار - ${data.accountName} - ${new Date().toLocaleDateString("ar-OM")}`,
        public: false,
        files: { "wallet-data.json": { content: JSON.stringify(data, null, 2) } },
      };
      const url = ghGistId.trim() ? `https://api.github.com/gists/${ghGistId.trim()}` : "https://api.github.com/gists";
      const method = ghGistId.trim() ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `token ${ghToken.trim()}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const errJson = await res.json();
          detail = errJson.message || "";
        } catch (_) {}
        throw new Error(`HTTP ${res.status}${detail ? " - " + detail : ""}`);
      }
      const json = await res.json();
      const newGistId = json.id;
      setGhGistId(newGistId);
      await persistGhConfig(ghToken.trim(), newGistId);
      flashToast("تم حفظ نسخة البيانات في GitHub Gist");
    } catch (e) {
      flashToast("خطأ: " + (e.message || "تعذر الحفظ في GitHub"), 6000);
    } finally {
      setGistBusy(false);
    }
  }

  async function restoreFromGist() {
    if (!requireAdmin()) return;
    if (!ghToken.trim() || !ghGistId.trim()) {
      flashToast("أدخل GitHub Token و Gist ID أولاً");
      return;
    }
    setGistBusy(true);
    try {
      const res = await fetch(`https://api.github.com/gists/${ghGistId.trim()}`, {
        headers: { Authorization: `token ${ghToken.trim()}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        let detail = "";
        try {
          const errJson = await res.json();
          detail = errJson.message || "";
        } catch (_) {}
        throw new Error(`HTTP ${res.status}${detail ? " - " + detail : ""}`);
      }
      const json = await res.json();
      const file = json.files?.["wallet-data.json"];
      if (!file) throw new Error("لا يوجد ملف wallet-data.json داخل هذا الـ Gist");
      const parsed = migrateData(JSON.parse(file.content));
      if (!parsed.members) throw new Error("محتوى الملف غير صالح");
      update(() => parsed);
      setStatsYear(parsed.selectedYear);
      await persistGhConfig(ghToken.trim(), ghGistId.trim());
      flashToast("تم استرجاع البيانات من GitHub بنجاح");
    } catch (e) {
      flashToast("خطأ: " + (e.message || "تعذر الاسترجاع من GitHub"), 6000);
    } finally {
      setGistBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <div style={styles.loadingWrap}>
        <FontImport />
        <div style={styles.loadingSeal} />
        <p style={{ fontFamily: "Tajawal, sans-serif", color: "#6b7d73" }}>جارِ فتح المحفظة…</p>
      </div>
    );
  }

  const selKey = mKey(data.selectedYear, data.selectedMonthIndex);
  const totalCollectedThisMonth = data.members.reduce((s, m) => s + (m.payments[selKey] || 0), 0);
  const paidCount = data.members.filter((m) => (m.payments[selKey] || 0) >= data.monthlyDue).length;
  const totalWithdrawn = data.withdrawals.reduce((s, w) => s + Number(w.amount || 0), 0);
  const totalAllPayments = data.members.reduce(
    (s, m) => s + Object.values(m.payments).reduce((ss, v) => ss + Number(v || 0), 0),
    0
  );
  const currentBalance = data.openingBalance + totalAllPayments - totalWithdrawn;

  // سجل أثر الاستقطاعات على الرصيد: مرتّب زمنيًا، يوضح الرصيد قبل وبعد كل عملية
  const grossInflow = data.openingBalance + totalAllPayments;
  const sortedWithdrawals = [...data.withdrawals].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let runningBalance = grossInflow;
  const withdrawalLedger = sortedWithdrawals.map((w) => {
    const before = runningBalance;
    const after = before - Number(w.amount || 0);
    runningBalance = after;
    return { ...w, balanceBefore: before, balanceAfter: after };
  });

  // قائمة المتأخرين: متأخرات سابقة + عدم دفع الشهر المعروض حاليًا
  const arrearsList = data.members
    .map((m) => {
      const thisMonthPaid = m.payments[selKey] || 0;
      const unpaidThisMonth = thisMonthPaid < data.monthlyDue;
      const owedThisMonth = unpaidThisMonth ? data.monthlyDue - thisMonthPaid : 0;
      const legacyOwed = Math.abs(Math.min(m.arrears, 0));
      return { id: m.id, name: m.name, unpaidThisMonth, owedThisMonth, legacyOwed, totalOwed: legacyOwed + owedThisMonth };
    })
    .filter((x) => x.totalOwed > 0)
    .sort((a, b) => b.totalOwed - a.totalOwed);
  const totalArrears = -arrearsList.reduce((s, x) => s + x.totalOwed, 0);

  function goMonth(delta) {
    update((prev) => {
      let idx = prev.selectedMonthIndex + delta;
      let year = prev.selectedYear;
      if (idx > 11) { idx = 0; year += 1; }
      if (idx < 0) { idx = 11; year -= 1; }
      return { ...prev, selectedMonthIndex: idx, selectedYear: year };
    });
  }

  function setMemberAmount(id, rawValue) {
    if (!requireAdmin()) return;
    const value = Math.max(0, Number(rawValue) || 0);
    update((prev) => {
      const members = prev.members.map((m) => {
        if (m.id !== id) return m;
        const prevVal = m.payments[selKey] || 0;
        const payments = { ...m.payments };
        if (value === 0) delete payments[selKey];
        else payments[selKey] = value;
        const delta = value - prevVal;
        // دفع مبلغ إضافي هذا الشهر يقلّل تلقائيًا من متأخرات هذا الشخص إن وُجدت
        let arrears = m.arrears;
        if (delta > 0 && arrears < 0) {
          arrears = Math.min(0, arrears + delta);
        }
        return { ...m, payments, arrears, _delta: delta };
      });
      const delta = members.find((m) => m.id === id)._delta;
      const cleaned = members.map(({ _delta, ...rest }) => rest);
      return { ...prev, members: cleaned };
    });
  }

  function bumpMemberAmount(id, step) {
    const member = data.members.find((m) => m.id === id);
    const current = member.payments[selKey] || 0;
    setMemberAmount(id, Math.max(0, current + step));
  }

  function payArrears(id) {
    if (!requireAdmin()) return;
    bumpMemberAmount(id, data.monthlyDue);
    flashToast("تم تسجيل تسديد " + data.monthlyDue + " ريال من المتأخرات");
  }

  function addArrears(id) {
    update((prev) => ({
      ...prev,
      members: prev.members.map((m) => (m.id === id ? { ...m, arrears: m.arrears - prev.monthlyDue } : m)),
    }));
  }

  function removeMember(id) {
    if (!requireAdmin()) return;
    update((prev) => ({ ...prev, members: prev.members.filter((m) => m.id !== id) }));
  }

  function startEditName(m) {
    if (!requireAdmin()) return;
    setEditingMemberId(m.id);
    setEditingNameValue(m.name);
  }

  function saveEditName() {
    if (!requireAdmin()) return;
    const name = editingNameValue.trim();
    if (name) {
      update((prev) => ({
        ...prev,
        members: prev.members.map((m) => (m.id === editingMemberId ? { ...m, name } : m)),
      }));
    }
    setEditingMemberId(null);
    setEditingNameValue("");
  }

  function addMember() {
    if (!requireAdmin()) return;
    const name = newName.trim();
    if (!name) return;
    update((prev) => ({
      ...prev,
      members: [...prev.members, { id: uid(), name, arrears: 0, payments: {} }],
    }));
    setNewName("");
    setAddingMember(false);
    flashToast("تمت إضافة الشخص إلى المحفظة");
  }

  function openAddWithdraw() {
    if (!requireAdmin()) return;
    setEditWithdrawId(null);
    setWDate("");
    setWReason("");
    setWAmount("");
    setWParticipants(data.members.map((m) => m.id));
    setShowWithdraw(true);
  }

  function openEditWithdraw(w) {
    if (!requireAdmin()) return;
    setEditWithdrawId(w.id);
    setWDate(w.date);
    setWReason(w.reason);
    setWAmount(String(w.amount));
    setWParticipants(w.participantIds && w.participantIds.length ? w.participantIds : data.members.map((m) => m.id));
    setShowWithdraw(true);
  }

  function toggleParticipant(id) {
    setWParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitWithdraw() {
    if (!requireAdmin()) return;
    const amount = Number(wAmount);
    if (!wDate || !wReason.trim() || !amount || amount <= 0) {
      flashToast("الرجاء تعبئة التاريخ والسبب والمبلغ بشكل صحيح");
      return;
    }
    if (wParticipants.length === 0) {
      flashToast("اختر عضوًا واحدًا على الأقل للمشاركة في الاستقطاع");
      return;
    }
    const isEdit = !!editWithdrawId;
    update((prev) => {
      if (isEdit) {
        return {
          ...prev,
          withdrawals: prev.withdrawals.map((w) =>
            w.id === editWithdrawId
              ? { ...w, date: wDate, reason: wReason.trim(), amount, participantIds: wParticipants }
              : w
          ),
        };
      }
      return {
        ...prev,
        withdrawals: [
          { id: uid(), date: wDate, reason: wReason.trim(), amount, participantIds: wParticipants },
          ...prev.withdrawals,
        ],
      };
    });
    setShowWithdraw(false);
    setEditWithdrawId(null);
    setWDate("");
    setWReason("");
    setWAmount("");
    setWParticipants([]);
    flashToast(isEdit ? "تم تحديث بيانات الاستقطاع" : "تم تسجيل الاقتطاع من المحفظة");
  }

  function removeWithdrawal(id) {
    if (!requireAdmin()) return;
    update((prev) => ({
      ...prev,
      withdrawals: prev.withdrawals.filter((x) => x.id !== id),
    }));
  }

  function totalPaidToDate(member) {
    return Object.values(member.payments).reduce((s, v) => s + Number(v || 0), 0);
  }

  function buildMessage() {
    const template = data.messageTemplate || DEFAULT_MESSAGE_TEMPLATE;
    const nextKey = mKey(
      data.selectedMonthIndex === 11 ? data.selectedYear + 1 : data.selectedYear,
      data.selectedMonthIndex === 11 ? 0 : data.selectedMonthIndex + 1
    );
    const membersListText = data.members
      .map((m, i) => {
        const paidThis = (m.payments[selKey] || 0) >= data.monthlyDue;
        const paidNext = (m.payments[nextKey] || 0) >= data.monthlyDue;
        let mark = "";
        if (paidThis && paidNext) mark = " ☑️ ☑️";
        else if (paidThis) mark = " ☑️";
        let arrearsTxt = m.arrears < 0 ? ` ${fmt(m.arrears)} *متأخرات*` : "";
        return `${i + 1}-${m.name}${mark}${arrearsTxt}`;
      })
      .join("\n");

    const replacements = {
      "{الشهر}": MONTHS_AR[data.selectedMonthIndex],
      "{السنة}": String(data.selectedYear),
      "{المبلغ_الشهري}": fmt(data.monthlyDue),
      "{اسم_الحساب}": data.accountName,
      "{رقم_الحساب}": data.accountNumber,
      "{الرصيد}": fmt(currentBalance),
      "{قائمة_الأعضاء}": membersListText,
    };

    let result = template;
    Object.entries(replacements).forEach(([key, value]) => {
      result = result.split(key).join(value);
    });
    return result;
  }

  const message = buildMessage();

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      flashToast("تم نسخ الرسالة، جاهزة للإرسال في واتساب");
    } catch (e) {
      flashToast("تعذر النسخ التلقائي، انسخ النص يدويًا");
    }
  }
  function shareWhatsapp() {
    window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function printAnnual() {
    const rowsHtml = data.members
      .map((m) => {
        const yearTotal = MONTHS_SHORT.reduce((s, _, mi) => s + (m.payments[mKey(yearForStats, mi)] || 0), 0);
        const cells = MONTHS_SHORT.map((_, mi) => {
          const v = m.payments[mKey(yearForStats, mi)] || 0;
          const isPastOrCurrent = yearForStats < data.selectedYear || (yearForStats === data.selectedYear && mi <= data.selectedMonthIndex);
          if (v > 0) return `<td class="pos">${fmt(v)}</td>`;
          if (isPastOrCurrent) return `<td class="neg">—</td>`;
          return `<td class="zero">—</td>`;
        }).join("");
        const totalCls = yearTotal < 0 ? "neg" : yearTotal > 0 ? "pos" : "zero";
        return `<tr><td class="name">${escapeHtml(m.name)}</td>${cells}<td class="total ${totalCls}">${fmt(yearTotal)}</td></tr>`;
      })
      .join("");
    const totalsRow = `<tr><td class="name total">الإجمالي الشهري</td>${monthTotals
      .map((t) => {
        const cls = t < 0 ? "neg" : t > 0 ? "pos" : "zero";
        return `<td class="total ${cls}">${t !== 0 ? fmt(t) : "—"}</td>`;
      })
      .join("")}<td class="total grand">${fmt(grandTotal)}</td></tr>`;
    const headerCells = MONTHS_SHORT.map((_, mi) => `<th>${(mi + 1).toLocaleString("ar-OM")}</th>`).join("");

    const arrearsRows = arrearsList.length
      ? arrearsList
          .map((x) => {
            const parts = [];
            if (x.unpaidThisMonth) parts.push(`متأخر هذا الشهر (${fmt(x.owedThisMonth)} ر.ع)`);
            if (x.legacyOwed > 0) parts.push(`متأخرات سابقة (${fmt(x.legacyOwed)} ر.ع)`);
            return `<tr><td class="name">${escapeHtml(x.name)}</td><td>${escapeHtml(parts.join(" · "))}</td><td class="neg total">-${fmt(x.totalOwed)}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="3" style="text-align:center;color:#0B6E4F;font-weight:700;">لا يوجد متأخرون 🎉</td></tr>`;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>جدول المدفوعات ${yearForStats}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#1B2A22;}
  h2{margin:0 0 4px;font-size:18px;}
  p{margin:2px 0;font-size:12px;color:#444;}
  table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12px;}
  th,td{border:1px solid #999;padding:6px 5px;text-align:center;}
  td.name{text-align:right;font-weight:600;}
  .total{font-weight:800;}
  .grand{color:#0B6E4F;}
  thead th{background:#eee;}
  td.pos{color:#0B6E4F;font-weight:700;background:#EAF5EF;}
  td.neg{color:#B3261E;font-weight:700;background:#FDECEA;}
  td.zero{color:#B7ADA0;}
  .toolbar{display:flex;gap:10px;margin-bottom:16px;}
  .toolbar button{font-family:Tahoma,Arial,sans-serif;font-size:14px;padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-weight:700;}
  .btn-print{background:#0B6E4F;color:#fff;}
  .btn-close{background:#eee;color:#333;}
  @media print{.toolbar{display:none;}}
  .letterhead{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0B6E4F;padding-bottom:12px;margin-bottom:12px;}
  .logo{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#12946b,#084A36);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.25) inset;}
  .balance-box{background:#0B6E4F;color:#fff;border-radius:10px;padding:10px 16px;margin:14px 0;display:inline-block;font-weight:800;font-size:15px;}
  h3.section{font-size:14px;margin:22px 0 8px;color:#0B6E4F;}
</style></head><body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
  <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
</div>
<div class="letterhead">
  <div class="logo">💰</div>
  <div>
    <h2>${escapeHtml(data.accountName)}</h2>
    <p>رقم الحساب: ${escapeHtml(data.accountNumber)}</p>
  </div>
</div>
<div class="balance-box">الرصيد الحالي: ${fmt(currentBalance)} ر.ع</div>
<p>جدول المدفوعات السنوي — ${yearForStats}</p>
<table><thead><tr><th>الاسم</th>${headerCells}<th>الإجمالي</th></tr></thead>
<tbody>${rowsHtml}${totalsRow}</tbody></table>
<h3 class="section">قائمة المتأخرين (${arrearsList.length})</h3>
<table><thead><tr><th>الاسم</th><th>التفاصيل</th><th>المبلغ المستحق</th></tr></thead>
<tbody>${arrearsRows}</tbody></table>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      flashToast("يرجى السماح بالنوافذ المنبثقة لهذا الموقع لتتمكن من الطباعة");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function printWithdrawals() {
    const rows = data.withdrawals
      .map((w) => {
        const participants = w.participantIds && w.participantIds.length ? w.participantIds : data.members.map((m) => m.id);
        const names = participants
          .map((id) => data.members.find((m) => m.id === id)?.name)
          .filter(Boolean)
          .join("، ");
        const share = participants.length ? Math.round((Number(w.amount) / participants.length) * 100) / 100 : 0;
        return `<tr>
          <td>${escapeHtml(w.date)}</td>
          <td class="name">${escapeHtml(w.reason)}</td>
          <td class="total neg">-${fmt(Number(w.amount))}</td>
          <td>${participants.length}</td>
          <td class="neg">-${fmt(share)}</td>
          <td class="names">${escapeHtml(names)}</td>
        </tr>`;
      })
      .join("");
    const totalAmount = data.withdrawals.reduce((s, w) => s + Number(w.amount || 0), 0);

    const ledgerRows = withdrawalLedger
      .map(
        (w) =>
          `<tr><td>${escapeHtml(w.date)}</td><td class="name">${escapeHtml(w.reason)}</td><td class="neg total">-${fmt(
            Number(w.amount)
          )}</td><td>${fmt(w.balanceBefore)}</td><td class="total">${fmt(w.balanceAfter)}</td></tr>`
      )
      .join("");

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>سجل الاقتطاعات</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#1B2A22;}
  h2{margin:0 0 4px;font-size:18px;}
  p{margin:2px 0;font-size:12px;color:#444;}
  table{border-collapse:collapse;width:100%;margin-top:14px;font-size:11.5px;}
  th,td{border:1px solid #999;padding:6px 5px;text-align:center;}
  td.name{text-align:right;font-weight:600;}
  td.names{text-align:right;font-size:10.5px;color:#333;}
  .total{font-weight:800;}
  thead th{background:#eee;}
  td.neg{color:#B3261E;font-weight:700;}
  .toolbar{display:flex;gap:10px;margin-bottom:16px;}
  .toolbar button{font-family:Tahoma,Arial,sans-serif;font-size:14px;padding:9px 18px;border-radius:8px;border:none;cursor:pointer;font-weight:700;}
  .btn-print{background:#0B6E4F;color:#fff;}
  .btn-close{background:#eee;color:#333;}
  @media print{.toolbar{display:none;}}
  .letterhead{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0B6E4F;padding-bottom:12px;margin-bottom:12px;}
  .logo{width:46px;height:46px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#12946b,#084A36);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,0.25) inset;}
  .balance-box{background:#0B6E4F;color:#fff;border-radius:10px;padding:10px 16px;margin:14px 0;display:inline-block;font-weight:800;font-size:15px;}
  h3.section{font-size:14px;margin:22px 0 8px;color:#0B6E4F;}
</style></head><body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
  <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
</div>
<div class="letterhead">
  <div class="logo">💰</div>
  <div>
    <h2>${escapeHtml(data.accountName)}</h2>
    <p>رقم الحساب: ${escapeHtml(data.accountNumber)}</p>
  </div>
</div>
<div class="balance-box">الرصيد الحالي: ${fmt(currentBalance)} ر.ع</div>
<p>سجل الاقتطاعات — إجمالي المسحوب: ${fmt(totalAmount)} ر.ع</p>
<table><thead><tr>
  <th>التاريخ</th><th>السبب</th><th>المبلغ الإجمالي</th><th>عدد المشاركين</th><th>نصيب الفرد</th><th>الأعضاء المشاركون</th>
</tr></thead>
<tbody>${rows}</tbody></table>
<h3 class="section">أثر الاستقطاعات على الرصيد</h3>
<table><thead><tr>
  <th>التاريخ</th><th>السبب</th><th>المبلغ</th><th>الرصيد قبل الاستقطاع</th><th>الرصيد بعد الاستقطاع</th>
</tr></thead>
<tbody>${ledgerRows}</tbody></table>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) {
      flashToast("يرجى السماح بالنوافذ المنبثقة لهذا الموقع لتتمكن من الطباعة");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  const yearForStats = statsYear || data.selectedYear;
  const monthTotals = MONTHS_SHORT.map((_, mi) =>
    data.members.reduce((s, m) => s + (m.payments[mKey(yearForStats, mi)] || 0), 0)
  );
  const grandTotal = monthTotals.reduce((s, v) => s + v, 0);

  return (
    <div dir="rtl" lang="ar" style={styles.app}>
      <FontImport />
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* ===== Header / Seal ===== */}
      <div style={styles.headerCard} className="no-print">
        <div style={styles.adminBadgeRow}>
          {isAdmin ? (
            <span style={styles.adminBadgeOn}><Check size={12} /> وضع الإدارة</span>
          ) : (
            <button style={styles.adminBadgeOff} onClick={() => setLoginOpen(true)}>
              <Lock size={12} /> دخول الإدارة
            </button>
          )}
        </div>
        <div style={styles.sealWrap}>
          <div style={styles.seal}>
            <div style={styles.sealInner}>
              <span style={styles.sealLabel}>الرصيد الحالي</span>
              <span style={styles.sealAmount}>{fmt(currentBalance)}</span>
              <span style={styles.sealCurrency}>ريال عُماني</span>
            </div>
          </div>
        </div>

        <div style={styles.headerInfo}>
          {editingHeader ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={styles.fieldLabel}>اسم الحساب</label>
              <input style={styles.input} value={data.accountName} onChange={(e) => update((p) => ({ ...p, accountName: e.target.value }))} />
              <label style={styles.fieldLabel}>رقم الحساب</label>
              <input style={styles.input} value={data.accountNumber} onChange={(e) => update((p) => ({ ...p, accountNumber: e.target.value }))} />
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>الرصيد الافتتاحي (قبل بدء المتابعة)</label>
                  <input style={styles.input} type="number" value={data.openingBalance} onChange={(e) => update((p) => ({ ...p, openingBalance: Number(e.target.value) || 0 }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>قيمة الاشتراك الشهري</label>
                  <input style={styles.input} type="number" value={data.monthlyDue} onChange={(e) => update((p) => ({ ...p, monthlyDue: Number(e.target.value) || p.monthlyDue }))} />
                </div>
              </div>
              <button style={styles.smallPrimaryBtn} onClick={() => setEditingHeader(false)}>تم</button>
            </div>
          ) : (
            <>
              <div style={styles.monthPill}>
                <CalendarDays size={14} /> {MONTHS_AR[data.selectedMonthIndex]} {data.selectedYear}
              </div>
              <h1 style={styles.accName}>{data.accountName}</h1>
              <p style={styles.accNumber}>رقم الحساب: {data.accountNumber}</p>
              <button style={styles.editLink} onClick={() => { if (requireAdmin()) setEditingHeader(true); }}>تعديل بيانات الحساب</button>
            </>
          )}
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <div style={styles.tabs} className="no-print">
        <button style={{ ...styles.tabBtn, ...(tab === "home" ? styles.tabBtnActive : {}) }} onClick={() => setTab("home")}>
          <Users size={16} /> الأعضاء
        </button>
        <button style={{ ...styles.tabBtn, ...(tab === "stats" ? styles.tabBtnActive : {}) }} onClick={() => setTab("stats")}>
          <ScrollText size={16} /> الإحصائيات
        </button>
        <button style={{ ...styles.tabBtn, ...(tab === "settings" ? styles.tabBtnActive : {}) }} onClick={() => setTab("settings")}>
          <Settings size={16} /> الإعدادات
        </button>
      </div>

      {tab === "home" && (
        <>
          {/* Month navigator */}
          <div style={styles.monthNav} className="no-print">
            <button style={styles.navArrow} onClick={() => goMonth(1)}><ChevronRight size={18} /></button>
            <div style={styles.navLabel}>{MONTHS_AR[data.selectedMonthIndex]} {data.selectedYear}</div>
            <button style={styles.navArrow} onClick={() => goMonth(-1)}><ChevronLeft size={18} /></button>
          </div>

          <div style={styles.summaryRow} className="no-print">
            <div style={styles.summaryChip}>
              <span style={styles.summaryNum}>{paidCount}/{data.members.length}</span>
              <span style={styles.summaryLbl}>دفعوا هذا الشهر</span>
            </div>
            <div style={styles.summaryChip}>
              <span style={{ ...styles.summaryNum, color: "#0B6E4F" }}>{fmt(totalCollectedThisMonth)}</span>
              <span style={styles.summaryLbl}>محصّل هذا الشهر</span>
            </div>
            <div style={styles.summaryChip}>
              <span style={{ ...styles.summaryNum, color: totalArrears < 0 ? "#B3261E" : "#1B2A22" }}>{fmt(totalArrears)}</span>
              <span style={styles.summaryLbl}>إجمالي المتأخرات</span>
            </div>
          </div>

          {/* Members list */}
          <div style={styles.card} className="no-print">
            {data.members.map((m) => {
              const thisMonth = m.payments[selKey] || 0;
              return (
                <div key={m.id} style={styles.memberRow}>
                  <button style={styles.deleteBtn} onClick={() => removeMember(m.id)} aria-label="حذف">
                    <Trash2 size={15} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingMemberId === m.id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <input
                          autoFocus
                          style={styles.nameEditInput}
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEditName()}
                        />
                        <button style={styles.confirmNameBtn} onClick={saveEditName} aria-label="حفظ الاسم">
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div style={styles.memberNameRow}>
                        <span style={styles.memberName}>{m.name}</span>
                        <button style={styles.editNameBtn} onClick={() => startEditName(m)} aria-label="تعديل الاسم">
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    <div style={styles.memberTotal}>الإجمالي منذ البداية: {fmt(totalPaidToDate(m))} ر.ع</div>
                    {(m.arrears < 0 || thisMonth < data.monthlyDue) && (
                      <div style={styles.arrearsRow}>
                        {thisMonth < data.monthlyDue && (
                          <span style={styles.unpaidTag}>متأخر هذا الشهر</span>
                        )}
                        {m.arrears < 0 && (
                          <>
                            <span style={styles.arrearsTag}>{fmt(m.arrears)} متأخرات سابقة</span>
                            <button style={styles.payArrearsBtn} onClick={() => payArrears(m.id)}>تسديد {data.monthlyDue}</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={styles.amountStepper}>
                    <button style={styles.stepBtn} onClick={() => bumpMemberAmount(m.id, -10)}><Minus size={13} /></button>
                    <input
                      style={styles.amountInput}
                      type="number"
                      value={thisMonth}
                      onChange={(e) => setMemberAmount(m.id, e.target.value)}
                    />
                    <button style={styles.stepBtn} onClick={() => bumpMemberAmount(m.id, 10)}><Plus size={13} /></button>
                  </div>
                </div>
              );
            })}

            {addingMember ? (
              <div style={styles.addRow}>
                <input autoFocus style={styles.input} placeholder="اسم العضو الجديد" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} />
                <button style={styles.smallPrimaryBtn} onClick={addMember}>إضافة</button>
                <button style={styles.smallGhostBtn} onClick={() => { setAddingMember(false); setNewName(""); }}>إلغاء</button>
              </div>
            ) : (
              <button style={styles.addMemberBtn} onClick={() => { if (requireAdmin()) setAddingMember(true); }}>
                {isAdmin ? <Plus size={16} /> : <Lock size={13} />} إضافة شخص إلى المحفظة
              </button>
            )}
          </div>

          <p style={styles.hint} className="no-print">
            استخدم السهمين لتصفح أي شهر، وعدّل مبلغ كل شخص لذلك الشهر مباشرة. "الإجمالي منذ البداية" يجمع كل ما دفعه هذا الشخص في كل الشهور المسجّلة. أي مبلغ تضيفه لشخص عليه متأخرات يُخصم تلقائيًا من متأخراته.
          </p>

          <div style={styles.actionsGrid} className="no-print">
            <button style={{ ...styles.actionBtn, width: "100%" }} onClick={openAddWithdraw}>
              {isAdmin ? <ArrowRightLeft size={17} /> : <Lock size={15} />} اقتطاع من المحفظة
            </button>
          </div>

          <button style={styles.messageBtn} className="no-print" onClick={() => setMessageOpen(true)}>
            <Share2 size={17} /> إعداد رسالة واتساب الشهرية
          </button>
        </>
      )}

      {tab === "stats" && (
        <>
          <div style={styles.summaryRow} className="no-print">
            <div style={styles.summaryChip}>
              <span style={styles.summaryNum}>{data.withdrawals.length}</span>
              <span style={styles.summaryLbl}>عملية اقتطاع</span>
            </div>
            <div style={styles.summaryChip}>
              <span style={{ ...styles.summaryNum, color: "#B3261E" }}>{fmt(totalWithdrawn)}</span>
              <span style={styles.summaryLbl}>إجمالي المسحوب</span>
            </div>
            <div style={styles.summaryChip}>
              <span style={styles.summaryNum}>{fmt(currentBalance)}</span>
              <span style={styles.summaryLbl}>الرصيد الحالي</span>
            </div>
          </div>

          <div style={styles.card} className="no-print">
            <h3 style={styles.sectionTitle}>قائمة المتأخرين ({arrearsList.length})</h3>
            {arrearsList.length === 0 ? (
              <p style={{ ...styles.hint, textAlign: "center", padding: "16px 0" }}>لا يوجد متأخرون 🎉 الجميع سدّد شهر {MONTHS_AR[data.selectedMonthIndex]}</p>
            ) : (
              arrearsList.map((x) => (
                <div key={x.id} style={styles.arrearsListRow}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.memberName}>{x.name}</div>
                    <div style={styles.arrearsBreakdown}>
                      {x.unpaidThisMonth && <span>متأخر هذا الشهر ({fmt(x.owedThisMonth)} ر.ع)</span>}
                      {x.unpaidThisMonth && x.legacyOwed > 0 && <span> · </span>}
                      {x.legacyOwed > 0 && <span>متأخرات سابقة ({fmt(x.legacyOwed)} ر.ع)</span>}
                    </div>
                  </div>
                  <div style={styles.arrearsTotalAmount}>-{fmt(x.totalOwed)} ر.ع</div>
                </div>
              ))
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.statsHeaderRow} className="no-print">
              <h3 style={styles.sectionTitle}>جدول المدفوعات السنوي</h3>
              <button style={styles.printBtn} onClick={printAnnual}>
                <Printer size={15} /> طباعة PDF
              </button>
            </div>
            <div style={styles.yearNav} className="no-print">
              <button style={styles.navArrow} onClick={() => setStatsYear((y) => (y || data.selectedYear) + 1)}><ChevronRight size={16} /></button>
              <div style={styles.navLabel}>{yearForStats}</div>
              <button style={styles.navArrow} onClick={() => setStatsYear((y) => (y || data.selectedYear) - 1)}><ChevronLeft size={16} /></button>
            </div>

            <div style={styles.tableScroll}>
              <AnnualTable data={data} year={yearForStats} monthTotals={monthTotals} grandTotal={grandTotal} totalPaidToDate={totalPaidToDate} />
            </div>
          </div>

          <div style={styles.card} className="no-print">
            <div style={styles.statsHeaderRow}>
              <h3 style={styles.sectionTitle}>سجل الاقتطاعات</h3>
              {data.withdrawals.length > 0 && (
                <button style={styles.printBtn} onClick={printWithdrawals}>
                  <Printer size={15} /> طباعة PDF
                </button>
              )}
            </div>
            {data.withdrawals.length === 0 && (
              <p style={{ ...styles.hint, textAlign: "center", padding: "20px 0" }}>لا توجد عمليات اقتطاع مسجلة بعد</p>
            )}
            {data.withdrawals.map((w) => {
              const participants = w.participantIds && w.participantIds.length ? w.participantIds : data.members.map((m) => m.id);
              const share = participants.length ? Math.round((Number(w.amount) / participants.length) * 100) / 100 : 0;
              return (
                <div key={w.id} style={styles.withdrawRow}>
                  <button style={styles.deleteBtn} onClick={() => removeWithdrawal(w.id)} aria-label="حذف">
                    <Trash2 size={15} />
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={styles.wReason}>{w.reason}</div>
                    <div style={styles.wDate}>{w.date}</div>
                    <div style={styles.wShare}>
                      {participants.length} مشارك · نصيب الفرد {fmt(share)} ر.ع
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={styles.wAmount}>-{fmt(Number(w.amount))} ر.ع</div>
                    <button style={styles.editWithdrawBtn} onClick={() => openEditWithdraw(w)}>
                      <Pencil size={11} /> الأعضاء
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {withdrawalLedger.length > 0 && (
            <div style={styles.card} className="no-print">
              <h3 style={styles.sectionTitle}>أثر الاستقطاعات على الرصيد</h3>
              <div style={styles.tableScroll}>
                <table style={styles.matrixTable}>
                  <thead>
                    <tr>
                      <th style={styles.matrixTh}>التاريخ</th>
                      <th style={styles.matrixTh}>السبب</th>
                      <th style={styles.matrixTh}>المبلغ</th>
                      <th style={styles.matrixTh}>الرصيد قبل الاستقطاع</th>
                      <th style={styles.matrixTh}>الرصيد بعد الاستقطاع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawalLedger.map((w) => (
                      <tr key={w.id}>
                        <td style={styles.matrixTd}>{w.date}</td>
                        <td style={styles.matrixTdName}>{w.reason}</td>
                        <td style={{ ...styles.matrixTd, color: "#B3261E", fontWeight: 700 }}>-{fmt(Number(w.amount))}</td>
                        <td style={styles.matrixTd}>{fmt(w.balanceBefore)}</td>
                        <td style={{ ...styles.matrixTd, fontWeight: 700 }}>{fmt(w.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={styles.currentBalanceBanner}>
                <span>الرصيد الحالي</span>
                <span style={styles.currentBalanceBannerAmount}>{fmt(currentBalance)} ر.ع</span>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "settings" && (
        <>
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>تسجيل دخول الإدارة</h3>
            {isAdmin ? (
              <>
                <p style={styles.hint}>أنت مسجّل دخول كمسؤول، ويمكنك التعديل على كل بيانات المحفظة.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.smallGhostBtn} onClick={() => setChangePassOpen(true)}>تغيير كلمة المرور</button>
                  <button style={styles.logoutBtn} onClick={handleLogout}><LogOut size={14} /> تسجيل الخروج</button>
                </div>
              </>
            ) : (
              <>
                <p style={styles.hint}>الوضع الحالي: عرض فقط. سجّل دخول الإدارة لتتمكن من إضافة/حذف الأعضاء وتعديل المبالغ والاقتطاعات.</p>
                <button style={styles.primaryBtn} onClick={() => setLoginOpen(true)}><LogIn size={16} /> تسجيل الدخول</button>
              </>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>نسخ احتياطي محلي</h3>
            <p style={styles.hint}>نزّل نسخة من بيانات المحفظة كملف، أو استورد نسخة سابقة لمزامنة البيانات بين جهازين.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.backupBtn} onClick={exportLocalData}><DownloadCloud size={15} /> تنزيل نسخة</button>
              <button style={styles.backupBtnAlt} onClick={triggerImportFile}><UploadCloud size={15} /> استيراد نسخة</button>
            </div>
            <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
          </div>

          <div style={styles.card}>
            <h3 style={styles.sectionTitle}><Github size={15} style={{ verticalAlign: "-2px", marginLeft: 4 }} /> مزامنة GitHub (Gist)</h3>
            <p style={styles.hint}>احفظ نسخة من بيانات المحفظة في Gist خاص على GitHub، أو استرجع آخر نسخة محفوظة. لا حاجة لإنشاء مستودع.</p>
            <label style={styles.fieldLabel}>GitHub Token (صلاحية gist فقط)</label>
            <input
              type="password"
              style={styles.input}
              placeholder="ghp_...."
              value={ghToken}
              onChange={(e) => { setGhToken(e.target.value); persistGhConfig(e.target.value, ghGistId); }}
            />
            <label style={styles.fieldLabel}>Gist ID (يُملأ تلقائيًا بعد أول حفظ)</label>
            <input
              style={styles.input}
              placeholder="فارغ عند أول استخدام"
              value={ghGistId}
              onChange={(e) => { setGhGistId(e.target.value); persistGhConfig(ghToken, e.target.value); }}
            />
            <button
              style={styles.saveGhBtn}
              onClick={async () => {
                await persistGhConfig(ghToken, ghGistId);
                flashToast("تم حفظ الـ Token و Gist ID على هذا الجهاز، ولن يختفيا بعد التحديث");
              }}
            >
              <Check size={14} /> حفظ الإعدادات على هذا الجهاز
            </button>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={styles.backupBtn} disabled={gistBusy} onClick={saveToGist}>
                <UploadCloud size={15} /> {gistBusy ? "جارٍ الحفظ…" : "حفظ نسخة في GitHub"}
              </button>
              <button style={styles.backupBtnAlt} disabled={gistBusy} onClick={restoreFromGist}>
                <DownloadCloud size={15} /> {gistBusy ? "جارٍ الاسترجاع…" : "استرجاع من GitHub"}
              </button>
            </div>
            <p style={{ ...styles.hint, marginTop: 10 }}>
              يُحفظ الـ Token على هذا الجهاز فقط ولا يُرسل لأي جهة عدا GitHub مباشرة من متصفحك.
            </p>
          </div>
        </>
      )}

      {/* ===== Withdraw modal ===== */}
      {showWithdraw && (
        <div style={styles.overlay} onClick={() => setShowWithdraw(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{editWithdrawId ? "تعديل الاستقطاع" : "اقتطاع من المحفظة"}</h3>
              <button style={styles.iconBtn} onClick={() => setShowWithdraw(false)}><X size={18} /></button>
            </div>
            <label style={styles.fieldLabel}>التاريخ</label>
            <input type="date" style={styles.input} value={wDate} onChange={(e) => setWDate(e.target.value)} />
            <label style={styles.fieldLabel}>السبب</label>
            <input style={styles.input} placeholder="مثال: مناسبة عزاء / تهنئة" value={wReason} onChange={(e) => setWReason(e.target.value)} />
            <label style={styles.fieldLabel}>المبلغ الإجمالي (ر.ع)</label>
            <input type="number" style={styles.input} placeholder="0" value={wAmount} onChange={(e) => setWAmount(e.target.value)} />

            <div style={styles.participantsHeaderRow}>
              <label style={styles.fieldLabel}>الأعضاء المشاركون في تحمّل المبلغ</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={styles.tinyGhostBtn} onClick={() => setWParticipants(data.members.map((m) => m.id))}>تحديد الكل</button>
                <button style={styles.tinyGhostBtn} onClick={() => setWParticipants([])}>إلغاء الكل</button>
              </div>
            </div>
            <div style={styles.participantsList}>
              {data.members.map((m) => (
                <label key={m.id} style={styles.participantItem}>
                  <input type="checkbox" checked={wParticipants.includes(m.id)} onChange={() => toggleParticipant(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
            {Number(wAmount) > 0 && wParticipants.length > 0 && (
              <p style={styles.shareHint}>
                نصيب كل عضو: {fmt(Math.round((Number(wAmount) / wParticipants.length) * 100) / 100)} ر.ع (موزّع على {wParticipants.length} من الأعضاء)
              </p>
            )}
            <button style={styles.primaryBtn} onClick={submitWithdraw}>{editWithdrawId ? "حفظ التعديلات" : "تسجيل الاقتطاع"}</button>
          </div>
        </div>
      )}

      {/* ===== WhatsApp message modal ===== */}
      {messageOpen && (
        <div style={styles.overlay} onClick={() => { setMessageOpen(false); setEditingTemplate(false); }}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>رسالة واتساب الشهرية</h3>
              <button style={styles.iconBtn} onClick={() => { setMessageOpen(false); setEditingTemplate(false); }}><X size={18} /></button>
            </div>

            {editingTemplate ? (
              <>
                <p style={styles.hint}>
                  عدّل نص الرسالة كما تريد. المتغيرات بين قوسين {"{ }"} تُستبدل تلقائيًا بالقيم الفعلية:
                  {" "}{"{الشهر}"} {"{السنة}"} {"{المبلغ_الشهري}"} {"{اسم_الحساب}"} {"{رقم_الحساب}"} {"{الرصيد}"} {"{قائمة_الأعضاء}"}
                </p>
                <textarea
                  style={styles.templateTextarea}
                  value={data.messageTemplate}
                  onChange={(e) => { if (requireAdmin()) update((p) => ({ ...p, messageTemplate: e.target.value })); }}
                  rows={10}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={styles.smallGhostBtn}
                    onClick={() => { if (requireAdmin()) update((p) => ({ ...p, messageTemplate: DEFAULT_MESSAGE_TEMPLATE })); }}
                  >
                    استعادة القالب الافتراضي
                  </button>
                  <button style={styles.smallPrimaryBtn} onClick={() => setEditingTemplate(false)}>تم</button>
                </div>
              </>
            ) : (
              <>
                <pre style={styles.messagePreview}>{message}</pre>
                <button style={styles.editTemplateBtn} onClick={() => { if (requireAdmin()) setEditingTemplate(true); }}>
                  <Pencil size={13} /> تعديل نص الرسالة
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={styles.primaryBtn} onClick={copyMessage}><Copy size={16} /> نسخ الرسالة</button>
                  <button style={styles.whatsBtn} onClick={shareWhatsapp}><Share2 size={16} /> مشاركة عبر واتساب</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Admin login modal ===== */}
      {loginOpen && (
        <div style={styles.overlay} onClick={() => { setLoginOpen(false); setForgotPassConfirm(false); }}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {forgotPassConfirm ? "إعادة تعيين كلمة المرور" : data.adminPasswordHash ? "تسجيل دخول الإدارة" : "إنشاء كلمة مرور الإدارة"}
              </h3>
              <button style={styles.iconBtn} onClick={() => { setLoginOpen(false); setForgotPassConfirm(false); }}><X size={18} /></button>
            </div>

            {forgotPassConfirm ? (
              <>
                <p style={styles.hint}>
                  سيتم حذف كلمة المرور الحالية بالكامل، وستحتاج لإنشاء كلمة مرور جديدة فورًا. هذا الإجراء لا يمكن التراجع عنه.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button style={styles.logoutBtn} onClick={resetAdminPassword}>تأكيد إعادة التعيين</button>
                  <button style={styles.smallGhostBtn} onClick={() => setForgotPassConfirm(false)}>تراجع</button>
                </div>
              </>
            ) : (
              <>
                {!data.adminPasswordHash && (
                  <p style={styles.hint}>لا توجد كلمة مرور إدارة بعد. أنشئ واحدة الآن لحماية التعديل على المحفظة.</p>
                )}
                <label style={styles.fieldLabel}>كلمة المرور</label>
                <input
                  type="password"
                  style={styles.input}
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                {!data.adminPasswordHash && (
                  <>
                    <label style={styles.fieldLabel}>تأكيد كلمة المرور</label>
                    <input type="password" style={styles.input} value={loginConfirm} onChange={(e) => setLoginConfirm(e.target.value)} />
                  </>
                )}
                <label style={styles.checkboxRow}>
                  <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} />
                  <span>تذكرني على هذا الجهاز</span>
                </label>
                {loginError && <p style={styles.errorText}>{loginError}</p>}
                <button style={styles.primaryBtn} onClick={handleLogin}>
                  <LogIn size={16} /> {data.adminPasswordHash ? "دخول" : "إنشاء وتسجيل الدخول"}
                </button>
                {data.adminPasswordHash && (
                  <button style={styles.forgotLink} onClick={() => setForgotPassConfirm(true)}>نسيت كلمة المرور؟</button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== Change password modal ===== */}
      {changePassOpen && (
        <div style={styles.overlay} onClick={() => setChangePassOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>تغيير كلمة مرور الإدارة</h3>
              <button style={styles.iconBtn} onClick={() => setChangePassOpen(false)}><X size={18} /></button>
            </div>
            <label style={styles.fieldLabel}>كلمة المرور الحالية</label>
            <input type="password" style={styles.input} value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
            <label style={styles.fieldLabel}>كلمة المرور الجديدة</label>
            <input type="password" style={styles.input} value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <label style={styles.fieldLabel}>تأكيد كلمة المرور الجديدة</label>
            <input type="password" style={styles.input} value={newPass2} onChange={(e) => setNewPass2(e.target.value)} />
            <button style={styles.primaryBtn} onClick={handleChangePassword}>حفظ كلمة المرور الجديدة</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AnnualTable({ data, year, monthTotals, grandTotal, totalPaidToDate, printMode }) {
  return (
    <table style={printMode ? printStyles.table : styles.matrixTable}>
      <thead>
        <tr>
          <th style={printMode ? printStyles.th : styles.matrixTh}>الاسم</th>
          {MONTHS_SHORT.map((_, mi) => (
            <th key={mi} style={printMode ? printStyles.th : styles.matrixTh}>{(mi + 1).toLocaleString("ar-OM")}</th>
          ))}
          <th style={printMode ? printStyles.th : styles.matrixTh}>الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {data.members.map((m) => {
          const yearTotal = MONTHS_SHORT.reduce((s, _, mi) => s + (m.payments[mKey(year, mi)] || 0), 0);
          return (
            <tr key={m.id}>
              <td style={printMode ? printStyles.tdName : styles.matrixTdName}>{m.name}</td>
              {MONTHS_SHORT.map((_, mi) => {
                const v = m.payments[mKey(year, mi)] || 0;
                const isPastOrCurrent = year < data.selectedYear || (year === data.selectedYear && mi <= data.selectedMonthIndex);
                const cellStyle = printMode ? printStyles.td : styles.matrixTd;
                let colorStyle;
                if (v > 0) colorStyle = { color: "#0B6E4F", fontWeight: 700 };
                else if (isPastOrCurrent) colorStyle = { color: "#B3261E", background: "#FDECEA" };
                else colorStyle = { color: "#B7ADA0" };
                return (
                  <td key={mi} style={{ ...cellStyle, ...colorStyle }}>
                    {v > 0 ? fmt(v) : "—"}
                  </td>
                );
              })}
              <td style={{ ...(printMode ? printStyles.td : styles.matrixTd), fontWeight: 800 }}>{fmt(yearTotal)}</td>
            </tr>
          );
        })}
        <tr>
          <td style={{ ...(printMode ? printStyles.tdName : styles.matrixTdName), fontWeight: 800 }}>الإجمالي الشهري</td>
          {monthTotals.map((t, i) => (
            <td key={i} style={{ ...(printMode ? printStyles.td : styles.matrixTd), fontWeight: 800 }}>{t > 0 ? fmt(t) : "—"}</td>
          ))}
          <td style={{ ...(printMode ? printStyles.td : styles.matrixTd), fontWeight: 800, color: "#0B6E4F" }}>{fmt(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800&family=Tajawal:wght@400;500;700&display=swap');
      * { box-sizing: border-box; }
      @keyframes spin { to { transform: rotate(360deg); } }
      button { cursor: pointer; }
      input:focus { outline: 2px solid #0B6E4F; outline-offset: 1px; }
    `}</style>
  );
}

const printStyles = {
  table: { width: "100%", borderCollapse: "collapse", fontFamily: "'Tajawal', sans-serif", fontSize: 11 },
  th: { border: "1px solid #999", padding: "5px 4px", background: "#eee" },
  td: { border: "1px solid #999", padding: "5px 4px", textAlign: "center" },
  tdName: { border: "1px solid #999", padding: "5px 6px", textAlign: "right", fontWeight: 700 },
};

const styles = {
  app: { fontFamily: "'Tajawal', sans-serif", background: "#FAF6EE", color: "#1B2A22", minHeight: "100vh", padding: "16px 14px 40px", maxWidth: 480, margin: "0 auto" },
  loadingWrap: { minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "#FAF6EE" },
  loadingSeal: { width: 56, height: 56, borderRadius: "50%", border: "4px solid #C9A227", borderTopColor: "transparent", animation: "spin 0.9s linear infinite" },
  toast: { position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", background: "#1B2A22", color: "#fff", padding: "10px 18px", borderRadius: 999, fontSize: 13, zIndex: 200, boxShadow: "0 8px 20px rgba(0,0,0,0.25)" },
  headerCard: { background: "linear-gradient(160deg, #0B6E4F 0%, #084A36 100%)", borderRadius: 22, padding: "22px 18px", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, boxShadow: "0 10px 28px rgba(8,74,54,0.28)" },
  adminBadgeRow: { alignSelf: "flex-start", width: "100%", display: "flex", justifyContent: "flex-start" },
  adminBadgeOn: { display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 999, fontFamily: "'Tajawal', sans-serif", fontWeight: 700 },
  adminBadgeOff: { display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.18)", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 999, border: "none", fontFamily: "'Tajawal', sans-serif", fontWeight: 700 },
  sealWrap: { display: "flex", justifyContent: "center" },
  seal: { width: 148, height: 148, borderRadius: "50%", background: "repeating-conic-gradient(#C9A227 0deg 8deg, #E4C550 8deg 16deg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, position: "relative" },
  sealInner: { width: "100%", height: "100%", borderRadius: "50%", background: "#0B6E4F", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 },
  sealLabel: { fontSize: 10.5, opacity: 0.85, fontFamily: "'Tajawal', sans-serif" },
  sealAmount: { fontFamily: "'Cairo', sans-serif", fontSize: 30, fontWeight: 800, lineHeight: 1.1 },
  sealCurrency: { fontSize: 10.5, opacity: 0.85, fontFamily: "'Tajawal', sans-serif" },
  headerInfo: { width: "100%", textAlign: "center" },
  monthPill: { display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", padding: "5px 12px", borderRadius: 999, fontSize: 12, marginBottom: 8 },
  accName: { fontFamily: "'Cairo', sans-serif", fontSize: 15, margin: "4px 0 2px", fontWeight: 700, wordBreak: "break-word" },
  accNumber: { fontSize: 12.5, opacity: 0.85, margin: 0, direction: "ltr", display: "inline-block" },
  editLink: { marginTop: 10, background: "rgba(255,255,255,0.14)", border: "none", color: "#fff", fontSize: 12, padding: "6px 14px", borderRadius: 999, fontFamily: "'Tajawal', sans-serif" },
  tabs: { display: "flex", gap: 8, marginTop: 18, marginBottom: 14 },
  tabBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 12, border: "1px solid #E3DCC9", background: "#fff", color: "#6b7d73", fontFamily: "'Tajawal', sans-serif", fontSize: 13.5, fontWeight: 700 },
  tabBtnActive: { background: "#0B6E4F", color: "#fff", borderColor: "#0B6E4F" },
  monthNav: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #EFE9D8", borderRadius: 14, padding: "8px 14px", marginBottom: 14 },
  navArrow: { width: 32, height: 32, borderRadius: 9, border: "1px solid #E3DCC9", background: "#FCFAF4", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B6E4F" },
  navLabel: { fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 14.5 },
  summaryRow: { display: "flex", gap: 8, marginBottom: 14 },
  summaryChip: { flex: 1, background: "#fff", borderRadius: 14, padding: "12px 6px", textAlign: "center", border: "1px solid #EFE9D8" },
  summaryNum: { display: "block", fontFamily: "'Cairo', sans-serif", fontSize: 17, fontWeight: 800 },
  summaryLbl: { display: "block", fontSize: 10.5, color: "#6b7d73", marginTop: 2 },
  card: { background: "#fff", borderRadius: 18, padding: 14, border: "1px solid #EFE9D8", marginBottom: 14 },
  sectionTitle: { fontFamily: "'Cairo', sans-serif", fontSize: 14.5, fontWeight: 700, margin: "2px 0 12px" },
  statsHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  printBtn: { display: "flex", alignItems: "center", gap: 6, border: "1px solid #C9A227", color: "#8A6D1A", background: "#FDF6E3", borderRadius: 10, padding: "7px 12px", fontFamily: "'Tajawal', sans-serif", fontSize: 12.5, fontWeight: 700 },
  yearNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 12 },
  memberRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid #F3EFE2" },
  memberName: { fontSize: 14.5, fontWeight: 600 },
  memberNameRow: { display: "flex", alignItems: "center", gap: 6 },
  editNameBtn: { width: 22, height: 22, borderRadius: 6, border: "1px solid #E3DCC9", background: "#FCFAF4", color: "#6b7d73", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  nameEditInput: { flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #0B6E4F", fontFamily: "'Tajawal', sans-serif", fontSize: 13.5, background: "#fff" },
  confirmNameBtn: { width: 28, height: 28, borderRadius: 8, border: "none", background: "#0B6E4F", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  memberTotal: { fontSize: 11, color: "#6b7d73", marginTop: 2 },
  arrearsRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  arrearsTag: { fontSize: 11.5, color: "#B3261E", background: "#FBE9E7", padding: "2px 8px", borderRadius: 999, fontWeight: 700 },
  unpaidTag: { fontSize: 11.5, color: "#B3261E", background: "#FDE4E1", padding: "2px 8px", borderRadius: 999, fontWeight: 700, border: "1px solid #F3B9B2" },
  arrearsListRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid #F3EFE2" },
  arrearsBreakdown: { fontSize: 11, color: "#B3261E", marginTop: 3 },
  arrearsTotalAmount: { fontSize: 14, fontWeight: 800, color: "#B3261E", fontFamily: "'Cairo', sans-serif" },
  payArrearsBtn: { fontSize: 11, border: "1px solid #C9A227", color: "#8A6D1A", background: "#FDF6E3", borderRadius: 999, padding: "2px 9px", fontFamily: "'Tajawal', sans-serif" },
  amountStepper: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  stepBtn: { width: 26, height: 26, borderRadius: 7, border: "1px solid #E3DCC9", background: "#FCFAF4", display: "flex", alignItems: "center", justifyContent: "center", color: "#0B6E4F" },
  amountInput: { width: 46, textAlign: "center", padding: "5px 2px", borderRadius: 7, border: "1px solid #E3DCC9", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13 },
  deleteBtn: { width: 30, height: 30, borderRadius: 8, border: "none", background: "#FBE9E7", color: "#B3261E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  addRow: { display: "flex", gap: 6, marginTop: 12, alignItems: "center" },
  addMemberBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: 10, padding: "11px 0", borderRadius: 12, border: "1.5px dashed #B9CFC2", background: "transparent", color: "#0B6E4F", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 13.5 },
  hint: { fontSize: 12, color: "#8a9490", lineHeight: 1.7, margin: "0 4px 16px" },
  actionsGrid: { display: "flex", gap: 8, marginBottom: 10 },
  actionBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", borderRadius: 14, border: "1px solid #EFE9D8", background: "#fff", color: "#1B2A22", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 12.5 },
  messageBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #C9A227, #B3901F)", color: "#fff", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 14.5, boxShadow: "0 8px 20px rgba(201,162,39,0.3)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(27,42,34,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 },
  modal: { background: "#fff", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 18, display: "flex", flexDirection: "column", gap: 8, maxHeight: "85vh", overflowY: "auto" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  modalTitle: { fontFamily: "'Cairo', sans-serif", fontSize: 16, fontWeight: 700, margin: 0 },
  iconBtn: { border: "none", background: "#F3EFE2", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 12, color: "#6b7d73", fontWeight: 700, marginTop: 6 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E3DCC9", fontFamily: "'Tajawal', sans-serif", fontSize: 14, background: "#FCFAF4" },
  primaryBtn: { marginTop: 10, padding: "12px 0", borderRadius: 12, border: "none", background: "#0B6E4F", color: "#fff", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 },
  smallPrimaryBtn: { padding: "10px 14px", borderRadius: 10, border: "none", background: "#0B6E4F", color: "#fff", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 13 },
  smallGhostBtn: { padding: "10px 14px", borderRadius: 10, border: "1px solid #E3DCC9", background: "#fff", color: "#6b7d73", fontFamily: "'Tajawal', sans-serif", fontSize: 13 },
  logoutBtn: { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, border: "1px solid #F3CFCB", background: "#FBE9E7", color: "#B3261E", fontFamily: "'Tajawal', sans-serif", fontSize: 13, fontWeight: 700 },
  backupBtn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 12, border: "none", background: "#0B6E4F", color: "#fff", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 13 },
  backupBtnAlt: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 12, border: "1px solid #E3DCC9", background: "#fff", color: "#0B6E4F", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 13 },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b7d73", marginTop: 8 },
  errorText: { color: "#B3261E", fontSize: 12.5, margin: "4px 0 0" },
  forgotLink: { marginTop: 10, background: "transparent", border: "none", color: "#6b7d73", fontSize: 12.5, textDecoration: "underline", fontFamily: "'Tajawal', sans-serif", alignSelf: "center" },
  saveGhBtn: { marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "9px 0", borderRadius: 10, border: "1px solid #C9A227", background: "#FDF6E3", color: "#8A6D1A", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 12.5 },
  templateTextarea: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E3DCC9", fontFamily: "'Tajawal', sans-serif", fontSize: 13, background: "#FCFAF4", resize: "vertical", lineHeight: 1.8, marginBottom: 8 },
  editTemplateBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "9px 0", borderRadius: 10, border: "1px dashed #B9CFC2", background: "transparent", color: "#0B6E4F", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 12.5, marginBottom: 8 },
  whatsBtn: { marginTop: 10, padding: "12px 0", borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1 },
  messagePreview: { background: "#FAF6EE", border: "1px solid #EFE9D8", borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", fontFamily: "'Tajawal', sans-serif", direction: "rtl", maxHeight: "45vh", overflowY: "auto" },
  withdrawRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid #F3EFE2" },
  wReason: { fontSize: 13.5, fontWeight: 600 },
  wDate: { fontSize: 11.5, color: "#8a9490", marginTop: 2 },
  wAmount: { fontSize: 13.5, fontWeight: 800, color: "#B3261E", fontFamily: "'Cairo', sans-serif" },
  wShare: { fontSize: 11, color: "#6b7d73", marginTop: 3 },
  editWithdrawBtn: { display: "flex", alignItems: "center", gap: 4, border: "1px solid #E3DCC9", background: "#FCFAF4", color: "#0B6E4F", borderRadius: 8, padding: "4px 9px", fontFamily: "'Tajawal', sans-serif", fontSize: 11 },
  participantsHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  tinyGhostBtn: { border: "1px solid #E3DCC9", background: "#fff", color: "#6b7d73", borderRadius: 8, padding: "4px 9px", fontFamily: "'Tajawal', sans-serif", fontSize: 11 },
  participantsList: { display: "flex", flexDirection: "column", gap: 2, maxHeight: 180, overflowY: "auto", border: "1px solid #EFE9D8", borderRadius: 10, padding: "6px 10px", background: "#FCFAF4" },
  participantItem: { display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", fontSize: 13.5, borderBottom: "1px solid #F3EFE2" },
  shareHint: { fontSize: 12, color: "#0B6E4F", background: "#EAF5EF", borderRadius: 10, padding: "8px 10px", margin: "4px 0 0" },
  tableScroll: { overflowX: "auto" },
  matrixTable: { borderCollapse: "collapse", fontSize: 11.5, minWidth: 620 },
  matrixTh: { border: "1px solid #EFE9D8", padding: "6px 5px", background: "#FAF6EE", fontWeight: 700, fontSize: 11 },
  matrixTd: { border: "1px solid #F3EFE2", padding: "6px 5px", textAlign: "center", whiteSpace: "nowrap" },
  matrixTdName: { border: "1px solid #F3EFE2", padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 },
  currentBalanceBanner: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0B6E4F", color: "#fff", borderRadius: 12, padding: "12px 16px", marginTop: 14, fontWeight: 700, fontSize: 13.5 },
  currentBalanceBannerAmount: { fontFamily: "'Cairo', sans-serif", fontSize: 16, fontWeight: 800 },
};
