import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const { t, dir } = useI18n();
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <main
      dir={dir}
      className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-4"
    >
      <Card className="w-full max-w-lg">
        <CardContent className="py-10 text-center">
          <div className="mb-6 flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertCircle aria-hidden="true" className="size-7" />
            </div>
          </div>

          <h1 className="mb-2 text-4xl font-bold text-slate-900">404</h1>

          <h2 className="mb-4 text-xl font-semibold text-slate-700">
            {t("notFound.title")}
          </h2>

          <p className="mb-8 text-slate-600 leading-relaxed">
            {t("notFound.subtitle")}
            <br />
            {t("notFound.description")}
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col justify-center gap-3 sm:flex-row"
          >
            <Button onClick={handleGoHome} className="px-6">
              <Home aria-hidden="true" className="me-2 size-4" />
              {t("notFound.goHome")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
