import { CourseDetail, courseMetadata } from "@/components/academy/course-detail";

export async function generateMetadata({ params }) {
  return courseMetadata("course", (await params).slug);
}

export default async function Page({ params }) {
  return <CourseDetail kind="course" slug={(await params).slug} />;
}
