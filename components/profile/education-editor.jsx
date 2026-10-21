"use client";

import { useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { Controller, useFieldArray, useWatch } from "react-hook-form";
import { GraduationCap, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { CollegePicker } from "@/components/colleges/college-picker";
import { createDepartmentAction, createProgramAction, getCollegeStructureAction } from "@/lib/actions/colleges";
import { ACCOUNT_TYPES } from "@/lib/constants";
import { MAX_EDUCATION } from "@/lib/validators/profile";
import { cn } from "@/lib/utils";

const NONE = "__none__";
const EMPTY_STRUCTURE = { departments: [], academic_programs: [] };

const YEAR_LABELS = {
  student: ["Started", "Expected graduation"],
  alumni: ["Started", "Graduated"],
  faculty: ["From", "Until (empty if you still work here)"],
  staff: ["From", "Until (empty if you still work here)"],
};

/** A one-line "not in the list? add it" form for a department or a course. The server returns the existing one when the name is already there. */
function AddItem({ label, placeholder, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await onAdd(name.trim());
      if (res.ok) {
        setName("");
        setOpen(false);
      } else setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-primary-text mt-1.5 inline-flex items-center gap-1 rounded text-xs font-semibold hover:underline">
        <Plus className="size-3.5" aria-hidden="true" /> {label}
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-2">
        <Input
          aria-label={label}
          value={name}
          maxLength={120}
          autoFocus
          placeholder={placeholder}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // this sits inside the profile / onboarding form: Enter adds, it never submits that form
              if (name.trim().length >= 2 && !pending) submit();
            }
          }}
        />
        <Button type="button" size="sm" onClick={submit} disabled={pending || name.trim().length < 2}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive-text text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Puts a new item in the list and lets it render before the caller selects it. A Select clears a value it has no option
 * for yet, so setting the value in the same breath as adding the option would lose it.
 */
async function listThen(update) {
  flushSync(update);
  await new Promise((resolve) => setTimeout(resolve, 40));
}

function EducationCard({ index, entry, college, structure, canRemove, isOnlyEntry, control, register, setValue, errors, onPickCollege, onClearCollege, onRemove, onMakePrimary, onStructureChange }) {
  const role = entry.role;
  const [startLabel, endLabel] = YEAR_LABELS[role] ?? YEAR_LABELS.student;
  const entryErrors = errors?.education?.[index] ?? {};
  const programs = structure.academic_programs.filter((p) => !entry.departmentId || !p.department_id || p.department_id === entry.departmentId);

  async function addDepartment(name) {
    const res = await createDepartmentAction({ collegeId: entry.collegeId, name });
    if (!res.ok) return res;
    const item = { id: res.id, name: res.name };
    await listThen(() => onStructureChange({ ...structure, departments: [...structure.departments.filter((d) => d.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)) }));
    setValue(`education.${index}.departmentId`, item.id, { shouldDirty: true });
    setValue(`education.${index}.programId`, null, { shouldDirty: true });
    return res;
  }

  async function addProgram(name) {
    const res = await createProgramAction({ collegeId: entry.collegeId, name, departmentId: entry.departmentId ?? null });
    if (!res.ok) return res;
    const item = { id: res.id, name: res.name, department_id: res.department_id ?? null };
    await listThen(() => onStructureChange({ ...structure, academic_programs: [...structure.academic_programs.filter((p) => p.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)) }));
    setValue(`education.${index}.programId`, item.id, { shouldDirty: true });
    return res;
  }

  return (
    <li className={cn("bg-card space-y-4 rounded-xl border p-4", entry.isPrimary && "border-primary/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <GraduationCap className="text-muted-foreground size-4" aria-hidden="true" />
          {college ? college.name : `School or college ${index + 1}`}
          {entry.isPrimary && !isOnlyEntry && <span className="bg-primary-soft text-primary-text rounded-full px-2 py-0.5 text-[11px] font-semibold">Main</span>}
        </p>
        <div className="flex items-center gap-1">
          {!entry.isPrimary && (
            <Button type="button" size="xs" variant="ghost" onClick={onMakePrimary} title="Your main college is used for “My college” features">
              <Star /> Make main
            </Button>
          )}
          {canRemove && (
            <Button type="button" size="xs" variant="ghost" onClick={onRemove} aria-label={`Remove ${college?.name ?? `school or college ${index + 1}`}`}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      </div>

      <CollegePicker
        id={`education-${index}-college`}
        label="School or college"
        optional={false}
        value={college}
        onChange={(next) => (next ? onPickCollege(next) : onClearCollege())}
        error={entryErrors.collegeId?.message}
        note={false}
        clearLabel={college ? `Choose a different college instead of ${college.name}` : undefined}
        placeholder="Start typing the name"
      />

      {entry.collegeId && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-semibold">Your role here</legend>
            <Controller
              control={control}
              name={`education.${index}.role`}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Your role at ${college?.name ?? "this college"}`}>
                  {ACCOUNT_TYPES.map((t) => {
                    const selected = field.value === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => field.onChange(t.value)}
                        className={cn(
                          "press min-h-10 rounded-lg border px-3.5 text-sm font-semibold transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-foreground/50",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {entryErrors.role?.message && (
              <p role="alert" className="text-destructive-text text-xs font-medium">
                {entryErrors.role.message}
              </p>
            )}
            <p className="text-muted-foreground text-xs">What you say about yourself. It is shown as that, never as a verified fact.</p>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id={`education-${index}-department`} label="Department" optional>
              <Controller
                control={control}
                name={`education.${index}.departmentId`}
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => {
                      field.onChange(v === NONE ? null : v);
                      setValue(`education.${index}.programId`, null, { shouldDirty: true });
                    }}
                  >
                    <SelectTrigger id={`education-${index}-department`} className="w-full">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not specified</SelectItem>
                      {structure.departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <AddItem label="Department not listed? Add it" placeholder="e.g. Computer Science" onAdd={addDepartment} />
            </Field>

            <Field id={`education-${index}-program`} label="Course / degree" optional>
              <Controller
                control={control}
                name={`education.${index}.programId`}
                render={({ field }) => (
                  <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                    <SelectTrigger id={`education-${index}-program`} className="w-full">
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not specified</SelectItem>
                      {programs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <AddItem label="Course not listed? Add it" placeholder="e.g. B.Tech, MBA, B.Com" onAdd={addProgram} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id={`education-${index}-start`} label={startLabel} optional error={entryErrors.startYear?.message}>
              <Input id={`education-${index}-start`} type="number" inputMode="numeric" min={1960} max={2100} placeholder="2023" {...register(`education.${index}.startYear`)} />
            </Field>
            <Field id={`education-${index}-end`} label={endLabel} optional error={entryErrors.endYear?.message}>
              <Input id={`education-${index}-end`} type="number" inputMode="numeric" min={1960} max={2100} placeholder="2027" {...register(`education.${index}.endYear`)} />
            </Field>
          </div>

          {entry.isPrimary && role === "student" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="currentYear" label="Current year" optional error={errors.currentYear?.message} hint="Only shown if you allow it.">
                <Input id="currentYear" type="number" inputMode="numeric" min={1} max={8} placeholder="3" {...register("currentYear")} />
              </Field>
              <Field id="currentSemester" label="Semester" optional error={errors.currentSemester?.message}>
                <Input id="currentSemester" type="number" inputMode="numeric" min={1} max={16} placeholder="5" {...register("currentSemester")} />
              </Field>
            </div>
          )}
        </>
      )}
    </li>
  );
}

/**
 * The schools and colleges a member lists: where they study now, studied before, or teach or work. Each has a role
 * (student, alumni, faculty, staff), an optional department and course, and years. One is the main one; it is the college
 * used for "My college" features. Nothing is required, and listing a college is an association, not a claim of enrolment.
 *
 * `initialColleges` maps college id -> summary and `initialStructures` college id -> departments and courses, for the
 * entries the member already has.
 */
export function EducationEditor({ control, register, setValue, errors, initialColleges = {}, initialStructures = {} }) {
  const { fields, append, remove } = useFieldArray({ control, name: "education" });
  const entries = useWatch({ control, name: "education" }) ?? [];
  const [colleges, setColleges] = useState(initialColleges);
  const [structures, setStructures] = useState(initialStructures);
  const [, startTransition] = useTransition();

  function pickCollege(index, summary) {
    setColleges((c) => ({ ...c, [summary.id]: summary }));
    setValue(`education.${index}.collegeId`, summary.id, { shouldDirty: true, shouldValidate: true });
    setValue(`education.${index}.departmentId`, null, { shouldDirty: true });
    setValue(`education.${index}.programId`, null, { shouldDirty: true });
    if (!structures[summary.id]) {
      startTransition(async () => {
        const res = await getCollegeStructureAction({ collegeId: summary.id });
        if (res.ok) setStructures((s) => ({ ...s, [summary.id]: { departments: res.departments, academic_programs: res.academic_programs } }));
      });
    }
  }

  function clearCollege(index) {
    setValue(`education.${index}.collegeId`, "", { shouldDirty: true });
    setValue(`education.${index}.departmentId`, null, { shouldDirty: true });
    setValue(`education.${index}.programId`, null, { shouldDirty: true });
  }

  function makePrimary(index) {
    entries.forEach((_, i) => setValue(`education.${i}.isPrimary`, i === index, { shouldDirty: true }));
  }

  function removeEntry(index) {
    // Someone has to stay the main one.
    if (entries[index]?.isPrimary && entries.length > 1) setValue(`education.${index === 0 ? 1 : 0}.isPrimary`, true, { shouldDirty: true });
    remove(index);
  }

  function addEntry() {
    append({ collegeId: "", role: "student", departmentId: null, programId: null, startYear: "", endYear: "", isPrimary: entries.length === 0 });
  }

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <div className="bg-sunken rounded-xl p-4 text-sm">
          <p className="font-semibold">No school or college listed</p>
          <p className="text-muted-foreground mt-0.5">Add where you study, studied before, or teach or work. You can add as many as you like.</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Your schools and colleges">
          {fields.map((field, index) => {
            const entry = entries[index] ?? field;
            return (
              <EducationCard
                key={field.id}
                index={index}
                entry={entry}
                college={entry.collegeId ? (colleges[entry.collegeId] ?? null) : null}
                structure={structures[entry.collegeId] ?? EMPTY_STRUCTURE}
                canRemove
                isOnlyEntry={fields.length === 1}
                control={control}
                register={register}
                setValue={setValue}
                errors={errors}
                onPickCollege={(summary) => pickCollege(index, summary)}
                onClearCollege={() => clearCollege(index)}
                onRemove={() => removeEntry(index)}
                onMakePrimary={() => makePrimary(index)}
                onStructureChange={(next) => entry.collegeId && setStructures((s) => ({ ...s, [entry.collegeId]: next }))}
              />
            );
          })}
        </ul>
      )}
      {errors?.education?.message && (
        <p role="alert" className="text-destructive-text text-sm font-medium">
          {errors.education.message}
        </p>
      )}
      {errors?.education?.root?.message && (
        <p role="alert" className="text-destructive-text text-sm font-medium">
          {errors.education.root.message}
        </p>
      )}
      {fields.length < MAX_EDUCATION && (
        <Button type="button" variant="outline" onClick={addEntry}>
          <Plus /> {fields.length === 0 ? "Add a school or college" : "Add another school or college"}
        </Button>
      )}
    </div>
  );
}
