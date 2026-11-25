import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

export default function TesterShell({ children }: { children: ReactNode }) {
  return <PageHeader shell="tester" logoAriaLabel="Go to active food tests">{children}</PageHeader>;
}
