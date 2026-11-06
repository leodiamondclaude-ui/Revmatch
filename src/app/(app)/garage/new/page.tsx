import { integrations, requireViewer } from "@/lib/viewer";
import { Wizard } from "./Wizard";

export const metadata = { title: "Add vehicle" };

export default async function NewVehicle() {
  const { user, accent } = await requireViewer();
  return <Wizard userId={user.id} accent={accent} integrations={integrations()} />;
}
