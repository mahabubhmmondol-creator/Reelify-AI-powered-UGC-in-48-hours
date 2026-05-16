import { useEffect, useState } from "react";
import axios from "axios";
import { Plus, Trash2, BookUser } from "lucide-react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

export const ContactsPanel = () => {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await axios.get(`${API}/jarvis/contacts`);
      setContacts(r.data || []);
    } catch (e) {
      console.error("contacts load failed", e);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setBusy(true);
    try {
      await axios.post(`${API}/jarvis/contacts`, {
        name: name.trim(),
        phone: phone.trim(),
      });
      setName("");
      setPhone("");
      load();
    } catch (err) {
      const detail = err?.response?.data?.detail || "add failed";
      alert(detail);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await axios.delete(`${API}/jarvis/contacts/${id}`);
      load();
    } catch (e) {
      console.error("delete failed", e);
    }
  };

  return (
    <div
      data-testid="contacts-panel"
      className="border border-[#222] bg-[#0a0a0a]"
    >
      <div className="px-5 py-3 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookUser size={12} strokeWidth={1.5} className="text-[#ff3b30]" />
          <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
            CONTACTS
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
          {contacts.length.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="max-h-[180px] overflow-y-auto log-scroll">
        {contacts.length === 0 && (
          <div className="px-5 py-3 font-mono text-[11px] text-neutral-600">
            // no contacts yet
          </div>
        )}
        {contacts.map((c) => (
          <div
            key={c.id}
            data-testid={`contact-row-${c.name}`}
            className="px-5 py-2 flex items-center justify-between border-b border-[#111] last:border-b-0 hover:bg-[#111]"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-[12px] text-white truncate">
                {c.name}
              </span>
              <span className="font-mono text-[10px] text-neutral-500 truncate">
                {c.phone}
              </span>
            </div>
            <button
              data-testid={`delete-contact-${c.name}`}
              onClick={() => remove(c.id)}
              className="text-neutral-600 hover:text-[#ff3b30] p-1"
              aria-label={`Delete ${c.name}`}
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} className="border-t border-[#1a1a1a] grid grid-cols-[1fr_1fr_auto] gap-0">
        <input
          data-testid="contact-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="NAME"
          className="bg-transparent px-3 py-2 font-mono text-[11px] text-white placeholder-neutral-700 border-r border-[#1a1a1a] focus:outline-none"
        />
        <input
          data-testid="contact-phone-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91…"
          className="bg-transparent px-3 py-2 font-mono text-[11px] text-white placeholder-neutral-700 border-r border-[#1a1a1a] focus:outline-none"
        />
        <button
          data-testid="add-contact-button"
          type="submit"
          disabled={busy}
          className="px-3 text-white hover:bg-[#111] disabled:opacity-40"
          aria-label="Add contact"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </form>
    </div>
  );
};
