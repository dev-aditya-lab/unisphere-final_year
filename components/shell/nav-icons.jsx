"use client";

import {
  Bell, Bookmark, Briefcase, CalendarDays, Compass, FolderKanban, GraduationCap,
  Home, Landmark, Lightbulb, Link2, MessageCircle, MessageSquareHeart, Settings, Users,
} from "lucide-react";

const ICONS = { Bell, Bookmark, Briefcase, CalendarDays, Compass, FolderKanban, GraduationCap, Home, Landmark, Lightbulb, Link2, MessageCircle, MessageSquareHeart, Settings, Users };

export function NavIcon({ name, ...props }) {
  const Icon = ICONS[name] ?? Home;
  return <Icon {...props} />;
}
