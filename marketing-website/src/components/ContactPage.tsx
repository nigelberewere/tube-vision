import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

export function ContactPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      // Replace with your backend endpoint or email service
      await new Promise((res) => setTimeout(res, 1200));
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className={cn("min-h-screen pb-12 transition-colors duration-500", isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900")}> 
      <div className="mx-auto w-full max-w-md px-4 pt-10 md:px-0 md:pt-16">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "mb-8 inline-flex items-center gap-1.5 text-sm transition-colors",
            isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800",
          )}
        >
          ← Back
        </button>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold md:text-4xl mb-2">Contact & Support</h1>
          <p className={cn("max-w-2xl text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>Feature requests, bug reports, or questions? Fill out the form below and our team will get back to you.</p>
        </motion.div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={form.name}
              onChange={handleChange}
              className={cn("w-full rounded-lg border px-3 py-2 text-sm", isDark ? "border-white/10 bg-white/5 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className={cn("w-full rounded-lg border px-3 py-2 text-sm", isDark ? "border-white/10 bg-white/5 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
            />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-1">Message</label>
            <textarea
              id="message"
              name="message"
              required
              rows={5}
              value={form.message}
              onChange={handleChange}
              className={cn("w-full rounded-lg border px-3 py-2 text-sm", isDark ? "border-white/10 bg-white/5 text-slate-100" : "border-slate-300 bg-white text-slate-900")}
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending" || status === "sent"}
            className={cn(
              "w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60",
              status === "sent" && "bg-green-600 hover:bg-green-700"
            )}
          >
            {status === "idle" && "Send Message"}
            {status === "sending" && "Sending..."}
            {status === "sent" && "Message Sent!"}
            {status === "error" && "Error. Try Again"}
          </button>
        </form>
      </div>
    </div>
  );
}
