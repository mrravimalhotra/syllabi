import { PracticeView } from "@/app/dashboard/practice/_parts/PracticeView";
import { getCurrentStudent } from "@/lib/auth";

/** Practice. The child's class is read with the page (the layout has already loaded the account), so nothing waits on a second request. */
export default async function PracticePage() {
  const student = await getCurrentStudent();
  return <PracticeView classLevel={student?.class_level ?? null} />;
}
