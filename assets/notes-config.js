/**
 * notes-config.js — where your notes sync to.
 *
 * Notes always work without this: they are saved in the browser you type them
 * in. Filling this in adds an account, so the same notes appear on your phone,
 * your laptop, and anywhere else you sign in.
 *
 * To fill it in:
 *   1. Create a free project at https://supabase.com (you have to do this
 *      yourself — it needs your email and a password).
 *   2. In the project, open  SQL Editor  and run the whole of
 *      supabase/notes_schema.sql  from this repo. That creates the notes table
 *      and locks every row to the account that wrote it.
 *   3. Open  Project Settings → API  and copy the two values below:
 *        Project URL      →  url
 *        anon public key  →  anonKey
 *
 * Both values are meant to be public — they ship inside every Supabase web app
 * and are safe in a git repo. They grant nothing on their own: the row-level
 * security policies in the schema mean a signed-in user can read and write
 * their own notes and nobody else's. Never put the *service_role* key here.
 */
window.QURAN_NOTES_CONFIG = {
  url: "",
  anonKey: "",
};
