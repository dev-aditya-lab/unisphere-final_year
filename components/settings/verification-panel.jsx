"use client";

import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { queueCelebration } from "@/components/motion/celebrate";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BadgeCheck, Clock, IdCard, Paperclip, Ticket, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  cancelVerificationAction,
  redeemInviteAction,
  submitManualVerificationAction,
  verifyStudentIdAction,
} from "@/lib/actions/verification";
import { uploadFileWithProgress } from "@/lib/storage/client";
import { useImageEditor } from "@/components/images/use-image-editor";

const inviteForm = z.object({ code: z.string().trim().min(1, "Enter your invitation code") });
const studentIdForm = z.object({ studentId: z.string().trim().min(4, "Enter your student ID").max(40) });
const manualForm = z.object({ info: z.string().trim().min(20, "Tell us a little more (at least 20 characters)").max(1000) });

function StudentIdMethod({ collegeName, onDone }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const form = useForm({ resolver: zodResolver(studentIdForm), defaultValues: { studentId: "" } });
  function onSubmit(values) {
    setError(null);
    startTransition(async () => {
      const res = await verifyStudentIdAction(values);
      if (res.ok) {
        queueCelebration("verified");
        form.reset();
        onDone();
      } else setError(res.fieldErrors?.studentId ?? res.error);
    });
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Enter the student ID printed on your {collegeName} ID card. {collegeName} keeps a private list of valid IDs, so this proves you are a real student without
        anyone seeing your ID: we check it against that list and never store or show it.
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="studentId" label="Student ID" error={form.formState.errors.studentId?.message} hint="Letters and numbers only; spaces and dashes are ignored. Each ID can be linked to one account.">
        <Input id="studentId" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="max-w-72 font-mono uppercase" aria-describedby="studentId-desc" {...form.register("studentId")} />
      </Field>
      <SubmitButton pending={pending} pendingText="Checking…">
        <IdCard /> Verify with student ID
      </SubmitButton>
    </form>
  );
}

function InviteMethod({ onDone }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const form = useForm({ resolver: zodResolver(inviteForm), defaultValues: { code: "" } });
  function onSubmit(values) {
    setError(null);
    startTransition(async () => {
      const res = await redeemInviteAction(values);
      if (res.ok) {
        toast.success("You are verified!");
        onDone();
      } else setError(res.error);
    });
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-muted-foreground text-sm">Your college administrator or club can give you a single-use code like <code className="bg-muted rounded px-1 font-mono text-xs">A1B2-C3D4-E5F6</code>.</p>
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="inviteCode" label="Invitation code" error={form.formState.errors.code?.message}>
        <Input id="inviteCode" autoCapitalize="characters" className="max-w-60 font-mono uppercase" aria-describedby="inviteCode-desc" {...form.register("code")} />
      </Field>
      <SubmitButton pending={pending} pendingText="Checking…">
        <Ticket /> Redeem code
      </SubmitButton>
    </form>
  );
}

function ManualMethod({ onDone }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [doc, setDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const { editImages, imageEditor } = useImageEditor();
  const form = useForm({ resolver: zodResolver(manualForm), defaultValues: { info: "" } });

  async function onPick(e) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    // A photo of an ID can be cropped to the card and straightened before it is sent; a PDF is sent as it is.
    const [file] = await editImages([picked], { title: "Crop your document" });
    if (!file) return;
    setUploading(true);
    const up = await uploadFileWithProgress(file, "verification_document");
    setUploading(false);
    if (up.ok) setDoc({ id: up.fileId, name: file.name });
    else toast.error(up.error);
  }

  function onSubmit(values) {
    setError(null);
    startTransition(async () => {
      const res = await submitManualVerificationAction({ info: values.info, documentFileId: doc?.id ?? null });
      if (res.ok) {
        toast.success("Request submitted for review");
        onDone();
      } else setError(res.error);
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-muted-foreground text-sm">
        A verification reviewer from your college checks the request. Documents are private: only reviewers see them, and they are never shown on your profile.
      </p>
      {error && <FormAlert>{error}</FormAlert>}
      <Field id="manualInfo" label="How can we confirm you belong to this college?" error={form.formState.errors.info?.message} hint="e.g. your enrolment or roll number, department, and a faculty contact. Do not include passwords or ID numbers you are not comfortable sharing.">
        <Textarea id="manualInfo" rows={4} maxLength={1000} aria-describedby="manualInfo-desc" {...form.register("info")} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={onPick} aria-label="Attach a supporting document" />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Paperclip /> {uploading ? "Uploading…" : doc ? "Replace document" : "Attach ID card (optional)"}
        </Button>
        {doc && <span className="text-muted-foreground truncate text-xs">{doc.name}</span>}
      </div>
      <SubmitButton pending={pending} pendingText="Submitting…" disabled={uploading}>
        <UserCheck /> Submit for review
      </SubmitButton>
      {imageEditor}
    </form>
  );
}

export function VerificationPanel({ status, college, latest, refresh }) {
  const [cancelPending, startCancel] = useTransition();
  const mode = college?.verification_mode ?? "manual";
  const defaultTab = mode === "student_id" ? "student_id" : mode === "invite" ? "invite" : "manual";

  if (!college) {
    return (
      <FormAlert variant="info" title="No college connected">
        Verification is optional. If you want a Verified badge, connect your college in your profile first.
      </FormAlert>
    );
  }

  // Only colleges whose listing has been reviewed by staff offer verification; for a community-added listing there
  // is nothing to check an ID against.
  if (status !== "verified" && college.listing_status !== "verified") {
    return (
      <FormAlert variant="info" title="Verification is not offered for this college">
        {college.name} is a community-added listing, so there is no official list to check against. That is fine: everything on UniSphere works without a badge.
      </FormAlert>
    );
  }

  if (status === "verified") {
    return (
      <div className="flex items-start gap-3">
        <BadgeCheck className="text-teal-text mt-0.5 size-6 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Verified member of {college.name}</p>
          <p className="text-muted-foreground text-sm">A verified badge appears on your profile and posts. Changing your college removes it.</p>
        </div>
      </div>
    );
  }

  if (status === "pending" && latest) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Clock className="text-warning-text mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{latest.status === "needs_info" ? "More information needed" : "Request under review"}</p>
            <p className="text-muted-foreground text-sm">
              {latest.status === "needs_info" && latest.rejection_reason ? latest.rejection_reason : "A reviewer will respond soon. We will notify you when there is a decision."}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={cancelPending}
          onClick={() =>
            startCancel(async () => {
              await cancelVerificationAction();
              toast.success("Request cancelled");
              refresh();
            })
          }
        >
          Cancel request
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === "rejected" && latest?.rejection_reason && (
        <FormAlert variant="warning" title="Your last request was not approved">
          {latest.rejection_reason}
        </FormAlert>
      )}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {mode === "student_id" && <TabsTrigger value="student_id">Student ID</TabsTrigger>}
          {mode === "invite" && <TabsTrigger value="invite">Invitation code</TabsTrigger>}
          <TabsTrigger value="manual">Manual review</TabsTrigger>
        </TabsList>
        {mode === "student_id" && (
          <TabsContent value="student_id" className="pt-4">
            <StudentIdMethod collegeName={college.name} onDone={refresh} />
          </TabsContent>
        )}
        {mode === "invite" && (
          <TabsContent value="invite" className="pt-4">
            <InviteMethod onDone={refresh} />
          </TabsContent>
        )}
        <TabsContent value="manual" className="pt-4">
          <ManualMethod onDone={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
