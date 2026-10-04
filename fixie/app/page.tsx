import { ScanScreen } from "@/components/scan-screen";

export default async function Home({ searchParams }: PageProps<"/">): Promise<React.JSX.Element> {
  const { demo, signin } = await searchParams;
  return <ScanScreen isDemo={demo === "1"} hasSignInFailed={signin === "failed"} />;
}
