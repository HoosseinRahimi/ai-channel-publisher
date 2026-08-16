import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { Send, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

export default function ManualLatestReportDelivery() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const recipient = trpc.publisher.recipientStatus.useQuery();
  const reports = trpc.publisher.weeklyReports.useQuery();
  const latest = reports.data?.[0];
  const deliver = trpc.publisher.deliverLatestWeeklyReport.useMutation({
    onSuccess: result => {
      if (result.delivered) toast.success(t("manualDelivery.toastSent"));
      else toast.error(t("manualDelivery.toastFailed"));
      utils.publisher.weeklyReports.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const unavailableMessage = !recipient.data?.connected ? t("manualDelivery.notConnected") : !latest ? t("manualDelivery.noReport") : null;

  return <Card className="border-sky-200 bg-sky-50/40 shadow-sm" dir={dir}><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><SendHorizontal className="h-5 w-5 text-sky-600" />{t("manualDelivery.title")}</CardTitle><CardDescription>{t("manualDelivery.desc")}</CardDescription></CardHeader><CardContent className="space-y-4">{latest ? <div className="rounded-xl bg-white p-3 text-sm text-slate-700"><p className="font-medium text-slate-900">{t("manualDelivery.latestReady")}</p><p className="mt-1 text-xs text-slate-500">{t("analytics.generatedAt", { time: latest.generatedAt.toLocaleString(locale) })}</p></div> : <div className="rounded-xl border border-dashed border-sky-200 p-3 text-sm text-slate-500">{t("manualDelivery.noneYet")}</div>}<AlertDialog><AlertDialogTrigger asChild><Button className="w-full" disabled={Boolean(unavailableMessage) || deliver.isPending}><Send className="h-4 w-4" />{t("manualDelivery.sendLatest")}</Button></AlertDialogTrigger><AlertDialogContent dir={dir}><AlertDialogHeader><AlertDialogTitle>{t("manualDelivery.confirmTitle")}</AlertDialogTitle><AlertDialogDescription>{t("manualDelivery.confirmDesc")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => deliver.mutate()}>{t("manualDelivery.sendAction")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>{unavailableMessage ? <p className="text-xs leading-5 text-sky-900">{unavailableMessage}</p> : null}</CardContent></Card>;
}
