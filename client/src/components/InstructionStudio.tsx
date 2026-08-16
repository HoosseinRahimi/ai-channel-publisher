import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { Bot, MessageSquareText, Save, SendHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function InstructionStudio() {
  const utils = trpc.useUtils();
  const { t, dir } = useI18n();
  const llmStatus = trpc.publisher.llmStatus.useQuery();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const chat = trpc.publisher.editorChat.useMutation({
    onSuccess: result => {
      setMessages(current => [...current, { role: "assistant", content: result.reply }]);
    },
    onError: error => toast.error(t("studio.errorHint", { message: error.message })),
  });
  const saveGuidance = trpc.publisher.updateEditorialPreferences.useMutation({
    onSuccess: () => {
      toast.success(t("studio.toastGuidanceSaved"));
      utils.publisher.dashboard.invalidate();
      utils.publisher.llmStatus.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const lastAssistantMessage = [...messages].reverse().find(message => message.role === "assistant");
  const configured = llmStatus.data?.effective.apiKeyConfigured ?? false;
  const effectiveModel = llmStatus.data?.effective.model;

  const send = () => {
    const content = input.trim();
    if (!content || chat.isPending) return;
    const nextHistory = [...messages, { role: "user" as const, content }];
    setMessages(nextHistory);
    setInput("");
    chat.mutate({ messages: nextHistory });
  };

  return <Card className="border-slate-200/80 shadow-sm" dir={dir}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><MessageSquareText className="h-5 w-5 text-violet-600" />{t("studio.title")}</CardTitle><CardDescription className="mt-2 max-w-3xl">{t("studio.desc")}</CardDescription></div>{effectiveModel ? <Badge variant="secondary" dir="ltr">{t("studio.modelLabel")}: {effectiveModel}</Badge> : null}</div></CardHeader>
    <CardContent className="space-y-4">
      {!configured ? <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{t("studio.needConfig")}</div> : null}
      <ScrollArea className="h-80 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
        {messages.length === 0 ? <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 text-center"><Bot className="h-8 w-8 text-violet-400" /><p className="max-w-md text-sm leading-6 text-slate-500">{t("studio.emptyState")}</p></div> : <div className="space-y-3">{messages.map((message, index) => <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.role === "user" ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`} dir="auto"><p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${message.role === "user" ? "text-violet-200" : "text-slate-400"}`}>{message.role === "user" ? t("studio.you") : t("common.model")}</p>{message.content}</div></div>)}</div>}
      </ScrollArea>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} maxLength={8000} className="min-h-20 flex-1" placeholder={t("studio.placeholder")} dir="auto" />
        <Button onClick={send} disabled={chat.isPending || !input.trim() || !configured}><SendHorizontal className="h-4 w-4" />{chat.isPending ? t("studio.thinking") : t("studio.send")}</Button>
      </div>
      {lastAssistantMessage ? <Button variant="outline" disabled={saveGuidance.isPending} onClick={() => saveGuidance.mutate({ editorialGuidance: lastAssistantMessage.content })}><Save className="h-4 w-4" />{t("studio.useAsGuidance")}</Button> : null}
    </CardContent>
  </Card>;
}
