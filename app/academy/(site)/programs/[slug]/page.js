import { CourseDetail, courseMetadata } from "@/components/academy/course-detail";

export async function generateMetadata({ params }) {
  return courseMetadata("program", (await params).slug);
}

export default async function Page({ params }) {
  return <CourseDetail kind="program" slug={(await params).slug} />;
}
