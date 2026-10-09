import { BelegEcht } from "@/neu/beleg-echt";

export default async function BelegSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BelegEcht token={token} />;
}
