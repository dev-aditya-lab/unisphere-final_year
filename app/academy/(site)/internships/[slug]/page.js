import { CourseDetail, courseMetadata } from "@/components/academy/course-detail";

export async function generateMetadata({ params }) {
  return courseMetadata("internship", (await params).slug);
}

export default async function Page({ params }) {
  return <CourseDetail kind="internship" slug={(await params).slug} />;
}
