import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getContacts, addContact, deleteContact, type Contact } from "../api";

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

// ── Integration toggle UI (no backend wiring needed) ─────────────────────────
const INTEGRATIONS = [
  { id: "gmail",    label: "Gmail",           icon: "📧", enabled: true  },
  { id: "calendar", label: "Google Calendar", icon: "📅", enabled: true  },
  { id: "n8n",      label: "n8n Webhooks",    icon: "⚡", enabled: false },
  { id: "notion",   label: "Notion",          icon: "📝", enabled: false },
];

export default function SettingsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [contactError, setContactError] = useState<string | null>(null);

  // Add contact form state
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  // Integrations toggle state
  const [integrations, setIntegrations] = useState(INTEGRATIONS);

  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true);
    setContactError(null);
    try {
      const data = await getContacts();
      setContacts(data);
    } catch {
      setContactError("Could not load contacts.");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim()) return;
    setAddLoading(true);
    setAddError(null);
    setAddSuccess(false);
    try {
      await addContact(addName.trim(), addEmail.trim(), addDisplayName.trim() || undefined);
      setAddName("");
      setAddEmail("");
      setAddDisplayName("");
      setAddSuccess(true);
      await fetchContacts();
      setTimeout(() => setAddSuccess(false), 2500);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add contact.");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeleteContact = async (name: string) => {
    try {
      await deleteContact(name);
      setContacts((prev) => prev.filter((c) => c.name !== name));
    } catch {
      // silently ignore
    }
  };

  const toggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i))
    );
  };

  return (
    <motion.div
      key="settings-view"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="space-y-8"
    >
      {/* ── Contacts ── */}
      <section>
        <SectionTitle
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          }
          label="Contacts"
          subtitle={`${contacts.length} saved`}
        />

        {/* Contact list */}
        <div className="mt-3 rounded-xl overflow-hidden border border-white/[0.06]" style={{ background: "rgba(255,255,255,0.02)" }}>
          {loadingContacts ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-9 rounded-lg bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : contactError ? (
            <p className="text-[11px] text-red-400/60 p-4">{contactError}</p>
          ) : contacts.length === 0 ? (
            <p className="text-[11px] text-white/20 px-4 py-5">No contacts added yet.</p>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              <AnimatePresence initial={false}>
                {contacts.map((c) => (
                  <motion.div
                    key={c.name}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                    transition={{ duration: 0.18, ease: EASE }}
                    className="group flex items-center gap-3 px-4 py-2.5"
                  >
                    {/* Avatar */}
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{
                        background: "linear-gradient(135deg, rgba(109,40,217,0.3), rgba(99,102,241,0.3))",
                        color: "#c4b5fd",
                        border: "1px solid rgba(139,92,246,0.2)",
                      }}
                    >
                      {c.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white/70 leading-none">{c.displayName}</p>
                      <p className="text-[10px] text-white/25 mt-0.5 truncate">{c.email}</p>
                    </div>
                    <motion.button
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150"
                      onClick={() => handleDeleteContact(c.name)}
                      title="Remove contact"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Add contact form */}
        <div
          className="mt-3 rounded-xl border border-white/[0.06] p-4"
          style={{ background: "rgba(255,255,255,0.015)" }}
        >
          <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">
            Add Contact
          </p>
          <form onSubmit={handleAddContact} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FormInput
                placeholder="Key name (e.g. rohit)"
                value={addName}
                onChange={setAddName}
              />
              <FormInput
                placeholder="Display name (optional)"
                value={addDisplayName}
                onChange={setAddDisplayName}
              />
            </div>
            <FormInput
              placeholder="Email address"
              value={addEmail}
              onChange={setAddEmail}
              type="email"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={addLoading || !addName.trim() || !addEmail.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, rgba(109,40,217,0.5), rgba(99,102,241,0.4))",
                  border: "1px solid rgba(139,92,246,0.3)",
                  color: "#c4b5fd",
                }}
              >
                {addLoading ? (
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="inline-block">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                    </svg>
                  </motion.span>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
                {addLoading ? "Saving…" : "Add"}
              </button>

              <AnimatePresence>
                {addSuccess && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] text-emerald-400/70"
                  >
                    Contact saved
                  </motion.span>
                )}
                {addError && (
                  <motion.span
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] text-red-400/70"
                  >
                    {addError}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </form>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section>
        <SectionTitle
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          }
          label="Integrations"
          subtitle="Manage connected services"
        />
        <div className="mt-3 rounded-xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]" style={{ background: "rgba(255,255,255,0.02)" }}>
          {integrations.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px]">{item.icon}</span>
                <span className="text-[12px] text-white/55">{item.label}</span>
              </div>
              <Toggle enabled={item.enabled} onToggle={() => toggleIntegration(item.id)} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Preferences ── */}
      <section>
        <SectionTitle
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
            </svg>
          }
          label="Preferences"
          subtitle="Session configuration"
        />
        <div className="mt-3 rounded-xl border border-white/[0.06] p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)" }}>
          <LabelledInput label="Your name" defaultValue="Aayush" />
          <LabelledInput label="Timezone" defaultValue="Asia/Kolkata" />
          <LabelledInput label="Default location" defaultValue="Gurgaon, Haryana" />
        </div>
      </section>
    </motion.div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, label, subtitle }: { icon: React.ReactNode; label: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-violet-400/50">{icon}</span>
      <span className="text-[12px] font-semibold text-white/50 uppercase tracking-widest">{label}</span>
      {subtitle && <span className="text-[10px] text-white/20 ml-auto">{subtitle}</span>}
    </div>
  );
}

function FormInput({
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg text-[11px] text-white/60 placeholder:text-white/15 outline-none transition-all duration-150 focus:ring-1 focus:ring-violet-500/30"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    />
  );
}

function LabelledInput({ label, defaultValue }: { label: string; defaultValue: string }) {
  const [val, setVal] = useState(defaultValue);
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[11px] text-white/35 flex-shrink-0 w-28">{label}</label>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="flex-1 px-3 py-1.5 rounded-lg text-[11px] text-white/55 outline-none transition-all duration-150 focus:ring-1 focus:ring-violet-500/25"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      />
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none"
      style={{
        background: enabled
          ? "linear-gradient(90deg, rgba(109,40,217,0.7), rgba(99,102,241,0.7))"
          : "rgba(255,255,255,0.08)",
        border: enabled ? "1px solid rgba(139,92,246,0.4)" : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <motion.span
        animate={{ x: enabled ? 16 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="inline-block h-3.5 w-3.5 rounded-full"
        style={{ background: enabled ? "#e9d5ff" : "rgba(255,255,255,0.3)" }}
      />
    </button>
  );
}
