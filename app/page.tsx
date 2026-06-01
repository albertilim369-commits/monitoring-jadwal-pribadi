"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Shield,
  Trash2,
  X
} from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  formatMonthLabel,
  formatShortDate,
  isPastDate,
  isToday,
  isWithinMonth,
  isWithinNextSevenDays,
  sortTasks,
  startOfMonth,
  toDateInputValue
} from "@/lib/dates";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "@/lib/supabase";
import type {
  ColorLabel,
  EventFormValues,
  EventItem,
  EventStatus,
  LeaderAccount,
  Priority,
  Profile,
  ScheduleTemplate,
  Subtask,
  Task,
  TaskFormValues,
  TaskStatus,
  TaskUpdate,
  UsernameLookupResult
} from "@/lib/types";

type ModalState =
  | { type: "choice" }
  | { type: "settings" }
  | { type: "leader" }
  | { type: "taskDetail"; taskId: string }
  | { type: "task"; task?: Task }
  | { type: "event"; event?: EventItem }
  | null;

type ActiveView = "today" | "week" | "month" | "history";

const priorityLabel: Record<Priority, string> = {
  high: "Tinggi",
  medium: "Sedang",
  low: "Rendah"
};

const statusLabel: Record<TaskStatus, string> = {
  todo: "Belum Mulai",
  in_progress: "Dikerjakan",
  done: "Selesai"
};

const viewOptions: Array<{ id: ActiveView; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 Hari" },
  { id: "month", label: "Bulan" },
  { id: "history", label: "Riwayat" }
];

const appBuildLabel = "Update 1 Juni 2026";

const emptyTaskForm: TaskFormValues = {
  title: "",
  deadline: toDateInputValue(),
  priority: "medium",
  status: "todo",
  note: ""
};

const emptyEventForm: EventFormValues = {
  title: "",
  date: toDateInputValue(),
  time: "",
  note: "",
  color_label: "neutral"
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [activeView, setActiveView] = useState<ActiveView>("today");
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(new Date()));
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }

      if (event === "SIGNED_OUT") {
        setPasswordRecovery(false);
      }

      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!userId) return;

    setDataLoading(true);
    setError("");

    const todayDate = new Date();
    const today = toDateInputValue(todayDate);
    const nextWeek = toDateInputValue(addDays(new Date(), 7));
    const monthStart = toDateInputValue(startOfMonth(activeMonth));
    const monthEnd = toDateInputValue(endOfMonth(activeMonth));
    const rangeStart = [monthStart, today].sort()[0];
    const rangeEnd = [monthEnd, nextWeek].sort()[1];

    let taskResult = await supabase
      .from("tasks")
      .select("*, subtasks(*), task_updates(*)")
      .eq("user_id", userId)
      .gte("deadline", rangeStart)
      .lte("deadline", rangeEnd)
      .order("deadline", { ascending: true });

    if (taskResult.error && isMissingProgressSchema(taskResult.error.message)) {
      taskResult = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .gte("deadline", rangeStart)
        .lte("deadline", rangeEnd)
        .order("deadline", { ascending: true });
    }

    const eventResult = await supabase
      .from("events")
      .select("*")
      .eq("user_id", userId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date", { ascending: true })
      .order("time", { ascending: true, nullsFirst: false });

    const templateResult = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const loadedProfile = await loadCurrentProfile(userId);

    setProfile(loadedProfile);

    if (taskResult.error || eventResult.error) {
      setError(taskResult.error?.message || eventResult.error?.message || "Gagal memuat data.");
    } else {
      const loadedTasks = ((taskResult.data || []) as Task[]).map((task) => ({
        ...task,
        subtasks: [...(task.subtasks || [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
        task_updates: [...(task.task_updates || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
      }));

      setTasks(sortTasks(loadedTasks));
      setEvents((eventResult.data || []) as EventItem[]);
      setTemplates(templateResult.error ? [] : ((templateResult.data || []) as ScheduleTemplate[]));
    }

    setDataLoading(false);
  }, [activeMonth, userId]);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setEvents([]);
      setTemplates([]);
      setProfile(null);
      return;
    }

    void loadDashboard();
  }, [loadDashboard, userId]);

  const visibleTasks = useMemo(() => sortTasks(tasks.filter((task) => task.status !== "done")), [tasks]);
  const monthTasks = useMemo(() => sortTasks(tasks.filter((task) => isWithinMonth(task.deadline, activeMonth))), [activeMonth, tasks]);
  const monthEvents = events.filter((event) => isWithinMonth(event.date, activeMonth));
  const todayTasks = tasks.filter((task) => isToday(task.deadline));
  const todayEvents = events.filter((event) => isToday(event.date));
  const upcomingTasks = visibleTasks.filter((task) => isWithinNextSevenDays(task.deadline) && !isToday(task.deadline));
  const upcomingEvents = events.filter((event) => !isEventInHistory(event) && isWithinNextSevenDays(event.date) && !isToday(event.date));
  const historyTasks = monthTasks.filter((task) => task.status === "done");
  const historyEvents = monthEvents.filter(isEventInHistory);
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const selectedTask = modal?.type === "taskDetail" ? tasks.find((task) => task.id === modal.taskId) : null;
  const isLeader = isLeaderProfile(profile);
  const focusTask = visibleTasks[0] || null;
  const monthItemCount = monthTasks.length + monthEvents.length;
  const currentView = getViewContent(activeView, {
    todayTasks,
    todayEvents,
    upcomingTasks,
    upcomingEvents,
    monthTasks,
    monthEvents,
    historyTasks,
    historyEvents
  });

  if (authLoading) {
    return (
      <main className="login-page">
        <div className="notice">Memuat aplikasi...</div>
      </main>
    );
  }

  if (passwordRecovery && session?.user) {
    return <PasswordResetView onDone={() => setPasswordRecovery(false)} />;
  }

  if (!session?.user) {
    return <LoginView />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{formatShortDate(toDateInputValue())}</p>
          <div className="title-row">
            <h1>Fokus Hari Ini</h1>
            <span className="version-pill">{appBuildLabel}</span>
          </div>
        </div>
        <div className="top-actions">
          {isLeader ? (
            <button className="icon-button" type="button" onClick={() => setModal({ type: "leader" })} aria-label="Leader panel">
              <Shield size={20} />
            </button>
          ) : null}
          <button className="icon-button" type="button" onClick={() => setModal({ type: "settings" })} aria-label="Settings">
            <Settings size={20} />
          </button>
          <button className="icon-button" type="button" onClick={() => void signOut()} aria-label="Keluar">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {error ? <div className="notice error-text">{error}</div> : null}
      {message ? <div className="notice">{message}</div> : null}

      <FocusPanel
        focusTask={focusTask}
        todayCount={todayTasks.length + todayEvents.length}
        weekCount={upcomingTasks.length + upcomingEvents.length}
        monthCount={monthItemCount}
      />

      <section className="status-strip" aria-label="Ringkasan">
        <div className="metric">
          <strong>{todayTasks.length + todayEvents.length}</strong>
          <span>Hari ini</span>
        </div>
        <div className="metric">
          <strong>{upcomingTasks.length + upcomingEvents.length}</strong>
          <span>7 hari</span>
        </div>
        <div className="metric">
          <strong>{doneCount}</strong>
          <span>Selesai</span>
        </div>
      </section>

      <nav className="view-tabs" aria-label="Tampilan data">
        {viewOptions.map((view) => (
          <button
            key={view.id}
            className={activeView === view.id ? "is-active" : ""}
            type="button"
            onClick={() => setActiveView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {(activeView === "month" || activeView === "history") ? (
        <div className="month-nav">
          <button className="icon-button" type="button" onClick={() => setActiveMonth((value) => addMonths(value, -1))} aria-label="Bulan sebelumnya">
            <ChevronLeft size={18} />
          </button>
          <strong>{formatMonthLabel(activeMonth)}</strong>
          <button className="icon-button" type="button" onClick={() => setActiveMonth((value) => addMonths(value, 1))} aria-label="Bulan berikutnya">
            <ChevronRight size={18} />
          </button>
        </div>
      ) : null}

      <DashboardSection
        title={currentView.title}
        caption={currentView.caption}
        tasks={currentView.tasks}
        events={currentView.events}
        emptyText={currentView.emptyText}
        onOpenTask={(task) => setModal({ type: "taskDetail", taskId: task.id })}
        onEditTask={(task) => setModal({ type: "task", task })}
        onEditEvent={(event) => setModal({ type: "event", event })}
        onDeleteTask={deleteTask}
        onDeleteEvent={deleteEvent}
        onStatusChange={updateTaskStatus}
        onEventStatusChange={updateEventStatus}
      />

      <button className="fab" type="button" onClick={() => setModal({ type: "choice" })} aria-label="Tambah">
        <Plus size={30} />
      </button>

      {modal ? (
        <Modal onClose={() => setModal(null)}>
          {modal.type === "choice" ? (
            <ChoiceSheet
              onTask={() => setModal({ type: "task" })}
              onEvent={() => setModal({ type: "event" })}
            />
          ) : null}
          {modal.type === "task" ? (
            <TaskForm
              task={modal.task}
              user={session.user}
              templates={templates.filter((template) => template.type === "task")}
              onCancel={() => setModal(null)}
              onSaved={async () => {
                setModal(null);
                await loadDashboard();
              }}
              onError={setError}
            />
          ) : null}
          {modal.type === "taskDetail" && selectedTask ? (
            <TaskDetailSheet
              task={selectedTask}
              onEdit={() => setModal({ type: "task", task: selectedTask })}
              onDelete={async () => {
                await deleteTask(selectedTask);
                setModal(null);
              }}
              onStatusChange={(status) => updateTaskStatus(selectedTask, status)}
              onChanged={loadDashboard}
              onError={setError}
            />
          ) : null}
          {modal.type === "event" ? (
            <EventForm
              event={modal.event}
              user={session.user}
              templates={templates.filter((template) => template.type === "event")}
              onCancel={() => setModal(null)}
              onSaved={async () => {
                setModal(null);
                await loadDashboard();
              }}
              onError={setError}
            />
          ) : null}
          {modal.type === "settings" ? (
            <SettingsSheet
              user={session.user}
              templates={templates}
              onChanged={loadDashboard}
              onError={setError}
            />
          ) : null}
          {modal.type === "leader" && isLeader ? (
            <LeaderSheet
              currentUserId={session.user.id}
              onAccountDeleted={async () => {
                setMessage("Akun berhasil dihapus.");
                await loadDashboard();
              }}
            />
          ) : null}
        </Modal>
      ) : null}

      {dataLoading ? <div className="notice">Menyegarkan data...</div> : null}
    </main>
  );

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updateTaskStatus(task: Task, status: TaskStatus) {
    setError("");
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", task.id)
      .eq("user_id", task.user_id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadDashboard();
  }

  async function deleteTask(task: Task) {
    setError("");
    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .eq("user_id", task.user_id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Task dihapus.");
    await loadDashboard();
  }

  async function deleteEvent(event: EventItem) {
    setError("");
    const { error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", event.id)
      .eq("user_id", event.user_id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Event dihapus.");
    await loadDashboard();
  }

  async function updateEventStatus(event: EventItem, status: EventStatus) {
    setError("");

    const { error: updateError } = await supabase
      .from("events")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null
      })
      .eq("id", event.id)
      .eq("user_id", event.user_id);

    if (updateError) {
      setError(toSchemaError(updateError.message));
      return;
    }

    await loadDashboard();
  }
}

function LoginView() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup" | "reset">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setError(supabaseConfigError || "Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local.");
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");

    const cleanUsername = normalizeUsername(username);
    let authError: { message: string } | null = null;

    if (!cleanUsername) {
      setError("Username wajib diisi dengan huruf, angka, titik, atau underscore.");
      setLoading(false);
      return;
    }

    if (!/^[a-z0-9._]{3,32}$/.test(cleanUsername)) {
      setError("Username harus 3-32 karakter dan hanya boleh huruf, angka, titik, atau underscore.");
      setLoading(false);
      return;
    }

    if (authMode === "reset") {
      const lookupResult = await supabase.rpc("get_email_by_username", {
        login_username: cleanUsername
      });

      if (lookupResult.error) {
        setError(toFriendlyAuthError(lookupResult.error.message));
        setLoading(false);
        return;
      }

      const rows = (lookupResult.data || []) as UsernameLookupResult[];
      const lookupEmail = rows[0]?.email;

      if (!lookupEmail) {
        setError("Username tidak ditemukan.");
        setLoading(false);
        return;
      }

      const resetResult = await supabase.auth.resetPasswordForEmail(lookupEmail, {
        redirectTo: window.location.origin
      });

      if (resetResult.error) {
        setError(toFriendlyAuthError(resetResult.error.message));
      } else {
        setMessage("Link reset password sudah dikirim ke Gmail akun ini.");
      }

      setLoading(false);
      return;
    }

    if (authMode === "signup" && !email.trim()) {
      setError("Gmail wajib diisi saat daftar akun baru.");
      setLoading(false);
      return;
    }

    if (authMode === "login") {
      const lookupResult = await supabase.rpc("get_email_by_username", {
        login_username: cleanUsername
      });

      if (lookupResult.error) {
        authError = lookupResult.error;
      } else {
        const rows = (lookupResult.data || []) as UsernameLookupResult[];
        const lookupEmail = rows[0]?.email;

        if (!lookupEmail) {
          authError = new Error("Username tidak ditemukan.");
        } else {
          const loginResult = await supabase.auth.signInWithPassword({
            email: lookupEmail,
            password
          });
          authError = loginResult.error;
        }
      }
    } else {
      const signupResult = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: cleanUsername
          }
        }
      });

      authError = signupResult.error;
    }

    if (authError) {
      setError(toFriendlyAuthError(authError.message));
    } else {
      setMessage(authMode === "login" ? "Berhasil masuk." : "Akun dibuat. Kamu sudah bisa login dengan username.");
    }

    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-row">
          <p className="eyebrow">My Daily Assistant</p>
          <span className="version-pill">{appBuildLabel}</span>
        </div>
        <h1>{authMode === "reset" ? "Reset password" : authMode === "login" ? "Masuk dan mulai hari ini" : "Daftar akun baru"}</h1>
        <p>
          {authMode === "reset"
            ? "Masukkan username. Link reset akan dikirim ke Gmail yang dipakai saat daftar."
            : "Login cukup pakai username dan password. Gmail hanya dipakai saat daftar akun."}
        </p>
        <div className="auth-switch" aria-label="Pilih mode auth">
          <button
            className={authMode === "login" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => {
              setAuthMode("login");
              setError("");
              setMessage("");
            }}
          >
            Masuk
          </button>
          <button
            className={authMode === "signup" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => {
              setAuthMode("signup");
              setError("");
              setMessage("");
            }}
          >
            Daftar
          </button>
          <button
            className={authMode === "reset" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => {
              setAuthMode("reset");
              setError("");
              setMessage("");
            }}
          >
            Reset
          </button>
        </div>
        <form className="form" onSubmit={(event) => void handleAuth(event)}>
          {!isSupabaseConfigured ? (
            <div className="notice">
              Supabase belum siap. {supabaseConfigError || "Isi `.env.local` sebelum login."}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="arnold"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              pattern="[A-Za-z0-9._]+"
              required
            />
          </div>
          {authMode === "signup" ? (
            <div className="field">
              <label htmlFor="email">Gmail untuk daftar</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="nama@gmail.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          ) : null}
          {authMode !== "reset" ? (
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>
          ) : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Memproses..." : authMode === "reset" ? "Kirim link reset" : authMode === "login" ? "Masuk" : "Daftar akun baru"}
          </button>
          {message ? <span>{message}</span> : null}
          {error ? <span className="error-text">{error}</span> : null}
        </form>
      </section>
    </main>
  );
}

function PasswordResetView({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Konfirmasi password belum sama.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(toFriendlyAuthError(updateError.message));
    } else {
      setPassword("");
      setConfirmPassword("");
      setMessage("Password baru sudah disimpan.");
    }

    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="eyebrow">My Daily Assistant</p>
        <h1>Buat password baru</h1>
        <p>Masukkan password baru untuk akun ini.</p>
        <form className="form" onSubmit={(event) => void handleUpdatePassword(event)}>
          <div className="field">
            <label htmlFor="new-password">Password baru</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Ulangi password baru</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan password"}
          </button>
          {message ? (
            <>
              <span>{message}</span>
              <button className="secondary-button" type="button" onClick={onDone}>
                Lanjut ke aplikasi
              </button>
            </>
          ) : null}
          {error ? <span className="error-text">{error}</span> : null}
        </form>
      </section>
    </main>
  );
}

async function loadCurrentProfile(userId: string) {
  const profileResult = await supabase
    .from("profiles")
    .select("user_id, username, email, role, created_at")
    .eq("user_id", userId)
    .single();

  if (!profileResult.error && profileResult.data) {
    const profile = profileResult.data as Profile;
    return {
      ...profile,
      role: profile.role || (profile.username === "arnold" ? "leader" : "member")
    } satisfies Profile;
  }

  if (!profileResult.error?.message.includes("role")) {
    return null;
  }

  const fallbackResult = await supabase
    .from("profiles")
    .select("user_id, username, email, created_at")
    .eq("user_id", userId)
    .single();

  if (fallbackResult.error || !fallbackResult.data) return null;

  const fallbackProfile = fallbackResult.data as Omit<Profile, "role">;
  return {
    ...fallbackProfile,
    role: fallbackProfile.username === "arnold" ? "leader" : "member"
  } satisfies Profile;
}

function FocusPanel({
  focusTask,
  todayCount,
  weekCount,
  monthCount
}: {
  focusTask: Task | null;
  todayCount: number;
  weekCount: number;
  monthCount: number;
}) {
  const progress = focusTask ? getTaskProgress(focusTask) : null;

  return (
    <section className="focus-panel" aria-label="Fokus utama">
      <div className="focus-copy">
        <p className="eyebrow">Fokus berikutnya</p>
        <h2>{focusTask ? focusTask.title : "Tidak ada task aktif"}</h2>
        <span>
          {focusTask
            ? `Deadline ${formatShortDate(focusTask.deadline)} - ${priorityLabel[focusTask.priority]} - ${statusLabel[focusTask.status]}`
            : "Agenda terlihat bersih untuk saat ini."}
        </span>
      </div>
      <div className="focus-meter">
        <strong>{progress && progress.total > 0 ? `${progress.percent}%` : todayCount}</strong>
        <span>{progress && progress.total > 0 ? "progress" : "hari ini"}</span>
      </div>
      <div className="focus-stats">
        <span>
          <strong>{todayCount}</strong> hari ini
        </span>
        <span>
          <strong>{weekCount}</strong> 7 hari
        </span>
        <span>
          <strong>{monthCount}</strong> bulan ini
        </span>
      </div>
    </section>
  );
}

function DashboardSection({
  title,
  caption,
  tasks,
  events,
  emptyText,
  onOpenTask,
  onEditTask,
  onEditEvent,
  onDeleteTask,
  onDeleteEvent,
  onStatusChange,
  onEventStatusChange
}: {
  title: string;
  caption: string;
  tasks: Task[];
  events: EventItem[];
  emptyText: string;
  onOpenTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onEditEvent: (event: EventItem) => void;
  onDeleteTask: (task: Task) => void;
  onDeleteEvent: (event: EventItem) => void;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onEventStatusChange: (event: EventItem, status: EventStatus) => void;
}) {
  const items = [
    ...events.map((event) => ({ kind: "event" as const, date: event.date, event })),
    ...tasks.map((task) => ({ kind: "task" as const, date: task.deadline, task }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <span>{caption}</span>
        </div>
        <span>{items.length}</span>
      </div>

      <div className="stack">
        {items.length === 0 ? <div className="empty-state">{emptyText}</div> : null}
        {items.map((item) =>
          item.kind === "task" ? (
            <TaskCard
              key={`task-${item.task.id}`}
              task={item.task}
              onOpen={() => onOpenTask(item.task)}
              onEdit={() => onEditTask(item.task)}
              onDelete={() => onDeleteTask(item.task)}
              onStatusChange={(status) => onStatusChange(item.task, status)}
            />
          ) : (
            <EventCard
              key={`event-${item.event.id}`}
              event={item.event}
              onEdit={() => onEditEvent(item.event)}
              onDelete={() => onDeleteEvent(item.event)}
              onStatusChange={(status) => onEventStatusChange(item.event, status)}
            />
          )
        )}
      </div>
    </section>
  );
}

function TaskCard({
  task,
  onOpen,
  onEdit,
  onDelete,
  onStatusChange
}: {
  task: Task;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
}) {
  const progress = getTaskProgress(task);

  return (
    <article className={`item-card task-card priority-${task.priority}`} onClick={onOpen}>
      <div className="item-main">
        <div className="item-title-row">
          <h3 className="item-title">{task.title}</h3>
          <span className={`badge ${task.priority}`}>{priorityLabel[task.priority]}</span>
        </div>
        <div className="item-meta">
          Deadline {formatShortDate(task.deadline)} - {statusLabel[task.status]}
        </div>
        {task.subtasks && task.subtasks.length > 0 ? (
          <div className="compact-progress" aria-label={`Progress ${progress.percent}%`}>
            <div className="progress-track">
              <span style={{ width: `${progress.percent}%` }} />
            </div>
            <span>{progress.percent}%</span>
          </div>
        ) : null}
        {task.note ? <p className="item-note">{task.note}</p> : null}
      </div>
      <div className="item-actions">
        <button
          className="action-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStatusChange(nextStatus(task.status));
          }}
        >
          <Check size={16} />
          {task.status === "done" ? "Buka" : "Update"}
        </button>
        <button
          className="action-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          aria-label="Edit task"
        >
          <Pencil size={16} />
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="Hapus task"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function TaskDetailSheet({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onChanged,
  onError
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onStatusChange: (status: TaskStatus) => Promise<void>;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const subtasks = task.subtasks || [];
  const updates = task.task_updates || [];
  const progress = getTaskProgress(task);

  async function addSubtask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = subtaskTitle.trim();
    if (!title) return;

    setSaving(true);
    onError("");

    const { error: insertError } = await supabase.from("subtasks").insert({
      task_id: task.id,
      title
    });

    if (insertError) {
      onError(toProgressError(insertError.message));
    } else {
      setSubtaskTitle("");
      await onChanged();
    }

    setSaving(false);
  }

  async function toggleSubtask(subtask: Subtask) {
    onError("");

    const { error: updateError } = await supabase
      .from("subtasks")
      .update({ is_done: !subtask.is_done })
      .eq("id", subtask.id);

    if (updateError) {
      onError(toProgressError(updateError.message));
      return;
    }

    await onChanged();
  }

  async function deleteSubtask(subtask: Subtask) {
    onError("");

    const { error: deleteError } = await supabase.from("subtasks").delete().eq("id", subtask.id);

    if (deleteError) {
      onError(toProgressError(deleteError.message));
      return;
    }

    await onChanged();
  }

  async function addUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = updateNote.trim();
    if (!note) return;

    setSaving(true);
    onError("");

    const { error: insertError } = await supabase.from("task_updates").insert({
      task_id: task.id,
      note
    });

    if (insertError) {
      onError(toProgressError(insertError.message));
    } else {
      setUpdateNote("");
      await onChanged();
    }

    setSaving(false);
  }

  async function deleteUpdate(update: TaskUpdate) {
    onError("");

    const { error: deleteError } = await supabase.from("task_updates").delete().eq("id", update.id);

    if (deleteError) {
      onError(toProgressError(deleteError.message));
      return;
    }

    await onChanged();
  }

  return (
    <>
      <div className="sheet-header">
        <div>
          <p className="eyebrow">Detail task</p>
          <h2>{task.title}</h2>
        </div>
      </div>

      <div className="detail-stack">
        <div className="badge-row">
          <span className={`badge ${task.priority}`}>{priorityLabel[task.priority]}</span>
          <span className="badge">{statusLabel[task.status]}</span>
          <span className="badge">Deadline {formatShortDate(task.deadline)}</span>
        </div>

        {task.note ? <p className="item-note">{task.note}</p> : null}

        <section className="progress-panel" aria-label="Progress task">
          <div className="progress-header">
            <strong>Progress</strong>
            <span>{progress.percent}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="item-meta">
            {progress.done} dari {progress.total} checklist selesai
          </p>
        </section>

        <div className="item-actions">
          <button className="action-button" type="button" onClick={() => void onStatusChange(nextStatus(task.status))}>
            <Check size={16} />
            {task.status === "done" ? "Buka lagi" : "Update status"}
          </button>
          <button className="action-button" type="button" onClick={onEdit}>
            <Pencil size={16} />
            Edit
          </button>
          <button className="danger-button" type="button" onClick={() => void onDelete()}>
            <Trash2 size={16} />
            Hapus
          </button>
        </div>

        <section className="detail-section">
          <div className="section-header compact">
            <h3>Checklist</h3>
            <span>{subtasks.length}</span>
          </div>
          <form className="inline-form" onSubmit={addSubtask}>
            <input
              aria-label="Tambah checklist"
              placeholder="Tambah checklist..."
              value={subtaskTitle}
              onChange={(event) => setSubtaskTitle(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={saving}>
              <Plus size={16} />
            </button>
          </form>
          <div className="progress-list">
            {subtasks.length === 0 ? <div className="empty-state">Belum ada checklist.</div> : null}
            {subtasks.map((subtask) => (
              <div className="check-row" key={subtask.id}>
                <button
                  className={`check-toggle ${subtask.is_done ? "is-done" : ""}`}
                  type="button"
                  onClick={() => void toggleSubtask(subtask)}
                  aria-label={subtask.is_done ? "Batalkan checklist" : "Selesaikan checklist"}
                >
                  {subtask.is_done ? <Check size={15} /> : null}
                </button>
                <span className={subtask.is_done ? "done-text" : ""}>{subtask.title}</span>
                <button className="icon-button small" type="button" onClick={() => void deleteSubtask(subtask)} aria-label="Hapus checklist">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-section">
          <div className="section-header compact">
            <h3>Update progress</h3>
            <span>{updates.length}</span>
          </div>
          <form className="form" onSubmit={addUpdate}>
            <div className="field">
              <label htmlFor="progress-update">Catatan update</label>
              <textarea
                id="progress-update"
                placeholder="Contoh: sudah sampai bab 3"
                value={updateNote}
                onChange={(event) => setUpdateNote(event.target.value)}
              />
            </div>
            <button className="primary-button" type="submit" disabled={saving}>
              Simpan update
            </button>
          </form>
          <div className="progress-list">
            {updates.length === 0 ? <div className="empty-state">Belum ada update progress.</div> : null}
            {updates.map((update) => (
              <article className="update-row" key={update.id}>
                <div>
                  <p>{update.note}</p>
                  <span>{formatUpdateDate(update.created_at)}</span>
                </div>
                <button className="icon-button small" type="button" onClick={() => void deleteUpdate(update)} aria-label="Hapus update">
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function EventCard({
  event,
  onEdit,
  onDelete,
  onStatusChange
}: {
  event: EventItem;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: EventStatus) => void;
}) {
  const label = event.color_label || "neutral";
  const status = event.status || "scheduled";
  const history = isEventInHistory(event);

  return (
    <article className={`item-card event-card color-${label}`}>
      <div className="item-main">
        <div className="item-title-row">
          <h3 className="item-title">{event.title}</h3>
          <span className={`badge ${history ? "done" : label}`}>{getEventStatusLabel(event)}</span>
        </div>
        <div className="item-meta">
          {formatShortDate(event.date)}
          {event.time ? ` - ${event.time.slice(0, 5)}` : ""}
        </div>
        {event.note ? <p className="item-note">{event.note}</p> : null}
      </div>
      <div className="item-actions">
        <button className="action-button" type="button" onClick={() => onStatusChange(status === "done" ? "scheduled" : "done")}>
          <Check size={16} />
          {status === "done" ? "Buka lagi" : "Selesai"}
        </button>
        <button className="action-button" type="button" onClick={onEdit} aria-label="Edit event">
          <Pencil size={16} />
        </button>
        <button className="danger-button" type="button" onClick={onDelete} aria-label="Hapus event">
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function ChoiceSheet({ onTask, onEvent }: { onTask: () => void; onEvent: () => void }) {
  return (
    <>
      <div className="sheet-header">
        <div>
          <p className="eyebrow">Tambah baru</p>
          <h2>Pilih jenis input</h2>
        </div>
      </div>
      <div className="choice-grid">
        <button className="choice-button" type="button" onClick={onTask}>
          <Check size={20} />
          <strong>Task</strong>
          <span>Deadline, prioritas, dan status.</span>
        </button>
        <button className="choice-button" type="button" onClick={onEvent}>
          <CalendarDays size={20} />
          <strong>Event</strong>
          <span>Jadwal dengan tanggal dan waktu.</span>
        </button>
      </div>
    </>
  );
}

function TaskForm({
  task,
  user,
  templates,
  onCancel,
  onSaved,
  onError
}: {
  task?: Task;
  user: User;
  templates: ScheduleTemplate[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<TaskFormValues>(
    task
      ? {
          title: task.title,
          deadline: task.deadline,
          priority: task.priority,
          status: task.status,
          note: task.note || ""
        }
      : emptyTaskForm
  );
  const [saving, setSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setForm({
      ...form,
      title: template.title,
      priority: template.priority || form.priority,
      note: template.note || ""
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    onError("");

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      deadline: form.deadline,
      priority: form.priority,
      status: form.status,
      note: form.note.trim() || null
    };

    const result = task
      ? await supabase.from("tasks").update(payload).eq("id", task.id).eq("user_id", user.id)
      : await supabase.from("tasks").insert(payload).select("id").single();

    if (result.error) {
      onError(result.error.message);
      setSaving(false);
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId);
    const createdTaskId = !task ? (result.data as { id: string } | null)?.id : null;

    if (createdTaskId && template?.checklist_items?.length) {
      const { error: checklistError } = await supabase.from("subtasks").insert(
        template.checklist_items.map((title) => ({
          task_id: createdTaskId,
          title
        }))
      );

      if (checklistError) {
        onError(toProgressError(checklistError.message));
      }
    }

    await onSaved();
    setSaving(false);
  }

  return (
    <>
      <div className="sheet-header">
        <div>
          <p className="eyebrow">{task ? "Edit task" : "Task baru"}</p>
          <h2>{task ? "Perbarui task" : "Tambah task"}</h2>
        </div>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        {!task && templates.length > 0 ? (
          <div className="field">
            <label htmlFor="task-template">Pakai template</label>
            <select id="task-template" value={selectedTemplateId} onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">Tanpa template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="task-title">Judul</label>
          <input
            id="task-title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            required
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="task-deadline">Deadline</label>
            <input
              id="task-deadline"
              type="date"
              value={form.deadline}
              onChange={(event) => setForm({ ...form, deadline: event.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="task-priority">Prioritas</label>
            <select
              id="task-priority"
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}
            >
              <option value="high">Tinggi</option>
              <option value="medium">Sedang</option>
              <option value="low">Rendah</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="task-status">Status</label>
          <select
            id="task-status"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
          >
            <option value="todo">Belum Mulai</option>
            <option value="in_progress">Sedang Dikerjakan</option>
            <option value="done">Selesai</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-note">Catatan</label>
          <textarea
            id="task-note"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Batal
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </>
  );
}

function EventForm({
  event,
  user,
  templates,
  onCancel,
  onSaved,
  onError
}: {
  event?: EventItem;
  user: User;
  templates: ScheduleTemplate[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<EventFormValues>(
    event
      ? {
          title: event.title,
          date: event.date,
          time: event.time?.slice(0, 5) || "",
          note: event.note || "",
          color_label: event.color_label || "neutral"
        }
      : emptyEventForm
  );
  const [saving, setSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setForm({
      ...form,
      title: template.title,
      note: template.note || "",
      color_label: template.color_label || form.color_label
    });
  }

  async function handleSubmit(submitEvent: React.FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setSaving(true);
    onError("");

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      date: form.date,
      time: form.time || null,
      note: form.note.trim() || null,
      color_label: form.color_label,
      status: event?.status || "scheduled"
    };

    let result = event
      ? await supabase.from("events").update(payload).eq("id", event.id).eq("user_id", user.id)
      : await supabase.from("events").insert(payload);

    if (result.error && result.error.message.includes("status")) {
      const fallbackPayload = {
        user_id: payload.user_id,
        title: payload.title,
        date: payload.date,
        time: payload.time,
        note: payload.note,
        color_label: payload.color_label
      };

      result = event
        ? await supabase.from("events").update(fallbackPayload).eq("id", event.id).eq("user_id", user.id)
        : await supabase.from("events").insert(fallbackPayload);
    }

    if (result.error) {
      onError(toSchemaError(result.error.message));
      setSaving(false);
      return;
    }

    await onSaved();
    setSaving(false);
  }

  return (
    <>
      <div className="sheet-header">
        <div>
          <p className="eyebrow">{event ? "Edit event" : "Event baru"}</p>
          <h2>{event ? "Perbarui event" : "Tambah event"}</h2>
        </div>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        {!event && templates.length > 0 ? (
          <div className="field">
            <label htmlFor="event-template">Pakai template</label>
            <select id="event-template" value={selectedTemplateId} onChange={(inputEvent) => applyTemplate(inputEvent.target.value)}>
              <option value="">Tanpa template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="event-title">Judul</label>
          <input
            id="event-title"
            value={form.title}
            onChange={(inputEvent) => setForm({ ...form, title: inputEvent.target.value })}
            required
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="event-date">Tanggal</label>
            <input
              id="event-date"
              type="date"
              value={form.date}
              onChange={(inputEvent) => setForm({ ...form, date: inputEvent.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="event-time">Waktu</label>
            <input
              id="event-time"
              type="time"
              value={form.time}
              onChange={(inputEvent) => setForm({ ...form, time: inputEvent.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="event-label">Label warna</label>
          <select
            id="event-label"
            value={form.color_label}
            onChange={(inputEvent) => setForm({ ...form, color_label: inputEvent.target.value as ColorLabel })}
          >
            <option value="neutral">Netral</option>
            <option value="red">Merah</option>
            <option value="blue">Biru</option>
            <option value="green">Hijau</option>
            <option value="yellow">Kuning</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="event-note">Catatan</label>
          <textarea
            id="event-note"
            value={form.note}
            onChange={(inputEvent) => setForm({ ...form, note: inputEvent.target.value })}
          />
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Batal
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </form>
    </>
  );
}

function SettingsSheet({
  user,
  templates,
  onChanged,
  onError
}: {
  user: User;
  templates: ScheduleTemplate[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null);
  const [form, setForm] = useState({
    type: "task" as "task" | "event",
    name: "",
    title: "",
    note: "",
    priority: "medium" as Priority,
    color_label: "neutral" as ColorLabel,
    checklist_items: ""
  });
  const [saving, setSaving] = useState(false);

  function startEdit(template: ScheduleTemplate) {
    setEditing(template);
    setForm({
      type: template.type,
      name: template.name,
      title: template.title,
      note: template.note || "",
      priority: template.priority || "medium",
      color_label: template.color_label || "neutral",
      checklist_items: (template.checklist_items || []).join("\n")
    });
  }

  function resetForm() {
    setEditing(null);
    setForm({
      type: "task",
      name: "",
      title: "",
      note: "",
      priority: "medium",
      color_label: "neutral",
      checklist_items: ""
    });
  }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    onError("");

    const payload = {
      user_id: user.id,
      type: form.type,
      name: form.name.trim(),
      title: form.title.trim(),
      note: form.note.trim() || null,
      priority: form.type === "task" ? form.priority : null,
      color_label: form.type === "event" ? form.color_label : null,
      checklist_items:
        form.type === "task"
          ? form.checklist_items
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
          : []
    };

    const result = editing
      ? await supabase.from("schedule_templates").update(payload).eq("id", editing.id).eq("user_id", user.id)
      : await supabase.from("schedule_templates").insert(payload);

    if (result.error) {
      onError(toSchemaError(result.error.message));
    } else {
      resetForm();
      await onChanged();
    }

    setSaving(false);
  }

  async function deleteTemplate(template: ScheduleTemplate) {
    onError("");
    const { error: deleteError } = await supabase.from("schedule_templates").delete().eq("id", template.id).eq("user_id", user.id);

    if (deleteError) {
      onError(toSchemaError(deleteError.message));
      return;
    }

    if (editing?.id === template.id) resetForm();
    await onChanged();
  }

  return (
    <>
      <div className="sheet-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Template jadwal</h2>
        </div>
      </div>

      <div className="detail-stack">
        <form className="form" onSubmit={saveTemplate}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="template-type">Tipe</label>
              <select id="template-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as "task" | "event" })}>
                <option value="task">Task</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="template-name">Nama template</label>
              <input id="template-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="template-title">Judul default</label>
            <input id="template-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="template-note">Catatan default</label>
            <textarea id="template-note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </div>
          {form.type === "task" ? (
            <>
              <div className="field">
                <label htmlFor="template-priority">Prioritas default</label>
                <select id="template-priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>
                  <option value="high">Tinggi</option>
                  <option value="medium">Sedang</option>
                  <option value="low">Rendah</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="template-checklist">Checklist default</label>
                <textarea
                  id="template-checklist"
                  placeholder="Satu checklist per baris"
                  value={form.checklist_items}
                  onChange={(event) => setForm({ ...form, checklist_items: event.target.value })}
                />
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="template-color">Label warna default</label>
              <select id="template-color" value={form.color_label} onChange={(event) => setForm({ ...form, color_label: event.target.value as ColorLabel })}>
                <option value="neutral">Netral</option>
                <option value="red">Merah</option>
                <option value="blue">Biru</option>
                <option value="green">Hijau</option>
                <option value="yellow">Kuning</option>
              </select>
            </div>
          )}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={resetForm}>
              Reset
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Menyimpan..." : editing ? "Update template" : "Simpan template"}
            </button>
          </div>
        </form>

        <section className="detail-section">
          <div className="section-header compact">
            <h3>Template tersimpan</h3>
            <span>{templates.length}</span>
          </div>
          <div className="progress-list">
            {templates.length === 0 ? <div className="empty-state">Belum ada template.</div> : null}
            {templates.map((template) => (
              <article className="update-row" key={template.id}>
                <div>
                  <p>{template.name}</p>
                  <span>
                    {template.type === "task" ? "Task" : "Event"} · {template.title}
                  </span>
                </div>
                <button className="action-button" type="button" onClick={() => startEdit(template)}>
                  <Pencil size={15} />
                </button>
                <button className="icon-button small" type="button" onClick={() => void deleteTemplate(template)} aria-label="Hapus template">
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function LeaderSheet({
  currentUserId,
  onAccountDeleted
}: {
  currentUserId: string;
  onAccountDeleted: () => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<LeaderAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const result = await supabase.rpc("leader_accounts");

    if (result.error) {
      setError(toLeaderError(result.error.message));
    } else {
      setAccounts(((result.data || []) as LeaderAccount[]).map(normalizeLeaderAccount));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  async function deleteAccount(account: LeaderAccount) {
    if (account.user_id === currentUserId) {
      setError("Akun yang sedang dipakai tidak bisa menghapus dirinya sendiri.");
      return;
    }

    if (account.username === "arnold") {
      setError("Akun leader utama arnold tidak boleh dihapus.");
      return;
    }

    const confirmed = window.confirm(`Hapus akun ${account.username}? Semua data task dan event akun ini ikut terhapus.`);
    if (!confirmed) return;

    setDeletingId(account.user_id);
    setError("");
    setMessage("");

    const { error: deleteError } = await supabase.rpc("leader_delete_account", {
      target_user_id: account.user_id
    });

    if (deleteError) {
      setError(toLeaderError(deleteError.message));
    } else {
      setMessage(`Akun ${account.username} sudah dihapus.`);
      await loadAccounts();
      await onAccountDeleted();
    }

    setDeletingId("");
  }

  const leaderCount = accounts.filter((account) => account.role === "leader").length;

  return (
    <>
      <div className="sheet-header">
        <div>
          <p className="eyebrow">Leader</p>
          <h2>Manage akun</h2>
        </div>
      </div>

      <div className="detail-stack">
        <section className="status-strip">
          <div className="metric">
            <strong>{accounts.length}</strong>
            <span>Total akun</span>
          </div>
          <div className="metric">
            <strong>{leaderCount}</strong>
            <span>Leader</span>
          </div>
          <div className="metric">
            <strong>{Math.max(accounts.length - leaderCount, 0)}</strong>
            <span>Member</span>
          </div>
        </section>

        {message ? <div className="notice">{message}</div> : null}
        {error ? <div className="notice error-text">{error}</div> : null}

        <button className="secondary-button" type="button" onClick={() => void loadAccounts()} disabled={loading}>
          {loading ? "Memuat akun..." : "Refresh daftar akun"}
        </button>

        <section className="detail-section">
          <div className="section-header compact">
            <h3>Daftar akun</h3>
            <span>{accounts.length}</span>
          </div>
          <div className="progress-list">
            {loading ? <div className="empty-state">Memuat daftar akun...</div> : null}
            {!loading && accounts.length === 0 ? <div className="empty-state">Belum ada akun lain.</div> : null}
            {accounts.map((account) => (
              <article className="account-row" key={account.user_id}>
                <div>
                  <div className="account-title">
                    <p>{account.username}</p>
                    <span className={`badge ${account.role === "leader" ? "green" : "blue"}`}>
                      {account.role === "leader" ? "Leader" : "Member"}
                    </span>
                  </div>
                  <span>{account.email || "Email tidak tersedia"}</span>
                  <span>Dibuat: {formatUpdateDate(account.created_at)}</span>
                  <span>Login terakhir: {account.last_sign_in_at ? formatUpdateDate(account.last_sign_in_at) : "Belum pernah"}</span>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void deleteAccount(account)}
                  disabled={deletingId === account.user_id || account.user_id === currentUserId || account.username === "arnold"}
                >
                  {deletingId === account.user_id ? "Menghapus..." : "Hapus"}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="sheet">
        <button className="close-button" type="button" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "todo") return "in_progress";
  if (status === "in_progress") return "done";
  return "todo";
}

function getTaskProgress(task: Task) {
  const subtasks = task.subtasks || [];
  const total = subtasks.length;
  const done = subtasks.filter((subtask) => subtask.is_done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return { done, total, percent };
}

function isEventInHistory(event: EventItem) {
  return event.status === "done" || isPastDate(event.date);
}

function isLeaderProfile(profile: Profile | null) {
  return profile?.role === "leader" || profile?.username === "arnold";
}

function normalizeLeaderAccount(account: LeaderAccount) {
  return {
    ...account,
    role: account.role || (account.username === "arnold" ? "leader" : "member"),
    last_sign_in_at: account.last_sign_in_at || null
  } satisfies LeaderAccount;
}

function getEventStatusLabel(event: EventItem) {
  if (event.status === "done") return "Selesai";
  if (isPastDate(event.date)) return "Lewat";
  return "Aktif";
}

function getViewContent(
  activeView: ActiveView,
  data: {
    todayTasks: Task[];
    todayEvents: EventItem[];
    upcomingTasks: Task[];
    upcomingEvents: EventItem[];
    monthTasks: Task[];
    monthEvents: EventItem[];
    historyTasks: Task[];
    historyEvents: EventItem[];
  }
) {
  if (activeView === "week") {
    return {
      title: "7 Hari",
      caption: "Agenda dan deadline 7 hari ke depan",
      tasks: data.upcomingTasks,
      events: data.upcomingEvents,
      emptyText: "Belum ada agenda 7 hari ke depan."
    };
  }

  if (activeView === "month") {
    return {
      title: "Bulan",
      caption: "Semua item pada bulan aktif",
      tasks: data.monthTasks,
      events: data.monthEvents,
      emptyText: "Belum ada data pada bulan ini."
    };
  }

  if (activeView === "history") {
    return {
      title: "Riwayat",
      caption: "Task selesai dan event lewat/selesai pada bulan aktif",
      tasks: data.historyTasks,
      events: data.historyEvents,
      emptyText: "Belum ada riwayat pada bulan ini."
    };
  }

  return {
    title: "Today",
    caption: "Event dan task jatuh tempo hari ini",
    tasks: data.todayTasks,
    events: data.todayEvents,
    emptyText: "Belum ada agenda hari ini."
  };
}

function formatUpdateDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isMissingProgressSchema(message: string) {
  return message.includes("subtasks") || message.includes("task_updates") || message.includes("schema cache");
}

function toProgressError(message: string) {
  if (isMissingProgressSchema(message)) {
    return "Fitur progress belum aktif di database. Jalankan ulang supabase/schema.sql di Supabase SQL Editor.";
  }

  return message;
}

function toSchemaError(message: string) {
  if (message.includes("profiles.role") || message.includes("column profiles.role") || message.includes("is_leader")) {
    return "Fitur leader belum aktif di database. Jalankan ulang supabase/schema.sql di Supabase SQL Editor.";
  }

  if (message.includes("schedule_templates") || message.includes("schema cache")) {
    return "Fitur template belum aktif di database. Jalankan ulang supabase/schema.sql di Supabase SQL Editor.";
  }

  if (message.includes("events.status") || message.includes("completed_at") || message.includes("column events.status")) {
    return "Status event belum aktif di database. Jalankan ulang supabase/schema.sql di Supabase SQL Editor.";
  }

  return toProgressError(message);
}

function toLeaderError(message: string) {
  if (
    message.includes("leader_accounts") ||
    message.includes("leader_delete_account") ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  ) {
    return "Database belum punya fungsi leader. Jalankan file supabase/leader-fix.sql di Supabase SQL Editor sampai hasil akhirnya: leader_accounts_ready=true, leader_delete_ready=true, arnold_is_leader=true.";
  }

  return toSchemaError(message);
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function toFriendlyAuthError(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("signups not allowed") || lowerMessage.includes("signup is disabled")) {
    return "Pendaftaran masih dimatikan di Supabase. Aktifkan Auth > Sign In / Providers > Allow new users to sign up.";
  }

  if (lowerMessage.includes("get_email_by_username") || lowerMessage.includes("function") || lowerMessage.includes("schema cache")) {
    return "Database username belum siap. Jalankan ulang isi supabase/schema.sql di Supabase SQL Editor.";
  }

  if (lowerMessage.includes("invalid login credentials")) {
    return "Username atau password salah.";
  }

  if (lowerMessage.includes("user already registered")) {
    return "Gmail ini sudah pernah didaftarkan. Coba masuk, atau gunakan Gmail lain.";
  }

  if (lowerMessage.includes("duplicate key")) {
    return "Username sudah dipakai. Pilih username lain.";
  }

  return message;
}
