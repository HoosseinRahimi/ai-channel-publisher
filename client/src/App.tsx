import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import OwnerOnly from "./components/OwnerOnly";
import { ThemeProvider } from "./contexts/ThemeContext";
import Audit from "./pages/Audit";
import Home from "./pages/Home";
import PublisherAnalytics from "./pages/PublisherAnalytics";
import PublisherPosts from "./pages/PublisherPosts";
import PublisherSettings from "./pages/PublisherSettings";
import Team from "./pages/Team";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/analytics" component={PublisherAnalytics} /><Route path="/posts" component={PublisherPosts} /><Route path="/settings" component={PublisherSettings} /><Route path="/team"><OwnerOnly><Team /></OwnerOnly></Route><Route path="/audit"><OwnerOnly><Audit /></OwnerOnly></Route><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-center" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
