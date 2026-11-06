import { Shell } from "@/components/shell/Shell";
import { requireViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();
  return <Shell>{children}</Shell>;
}
