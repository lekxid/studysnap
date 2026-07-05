export type StudyRoom = {
  id: number;
  name: string;
  subject: string;
  description?: string;
};

export type NoteItem = {
  id: number;
  title: string;
  content: string;
  study_room_id: number;
  owner_id: number;
  created_at?: string;
};
