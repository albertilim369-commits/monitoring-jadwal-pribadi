export type Priority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";
export type EventStatus = "scheduled" | "done";
export type ColorLabel = "red" | "blue" | "green" | "yellow" | "neutral";
export type TemplateType = "task" | "event";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  deadline: string;
  priority: Priority;
  status: TaskStatus;
  note: string | null;
  created_at: string;
  subtasks?: Subtask[];
  task_updates?: TaskUpdate[];
};

export type Subtask = {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  created_at: string;
};

export type TaskUpdate = {
  id: string;
  task_id: string;
  note: string;
  created_at: string;
};

export type EventItem = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string | null;
  note: string | null;
  color_label: ColorLabel | null;
  status?: EventStatus | null;
  completed_at?: string | null;
  created_at: string;
};

export type TaskFormValues = {
  title: string;
  deadline: string;
  priority: Priority;
  status: TaskStatus;
  note: string;
};

export type EventFormValues = {
  title: string;
  date: string;
  time: string;
  note: string;
  color_label: ColorLabel;
};

export type ScheduleTemplate = {
  id: string;
  user_id: string;
  type: TemplateType;
  name: string;
  title: string;
  note: string | null;
  priority: Priority | null;
  color_label: ColorLabel | null;
  checklist_items: string[] | null;
  created_at: string;
};

export type UsernameLookupResult = {
  email: string;
};
