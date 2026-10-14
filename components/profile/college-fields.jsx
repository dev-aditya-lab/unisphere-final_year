"use client";

import { useState, useTransition } from "react";
import { Controller, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { CollegePicker } from "@/components/colleges/college-picker";
import { getCollegeStructureAction } from "@/lib/actions/colleges";

const NONE = "__none__";

/**
 * College (optional) + department / programme (only when the college has defined them) + graduation year +
 * (self-described students) current year and semester.
 *
 * Choosing a college is an association, not a claim of enrolment, so nothing here is required.
 * `initialCollege` is the saved college summary; `initialStructure` its departments and programmes.
 */
export function CollegeFields({ control, register, setValue, errors, accountType, initialCollege = null, initialStructure = null, onCollegeChange }) {
  const [college, setCollege] = useState(initialCollege);
  const [structure, setStructure] = useState(initialStructure ?? { departments: [], academic_programs: [] });
  const [, startTransition] = useTransition();
  const departmentId = useWatch({ control, name: "departmentId" });

  const departments = structure.departments;
  const programs = structure.academic_programs.filter((p) => !departmentId || !p.department_id || p.department_id === departmentId);

  function onPick(next) {
    setCollege(next);
    setValue("collegeId", next?.id ?? null, { shouldDirty: true, shouldValidate: true });
    setValue("departmentId", null, { shouldDirty: true });
    setValue("programId", null, { shouldDirty: true });
    setValue("campusId", null, { shouldDirty: true });
    setStructure({ departments: [], academic_programs: [] });
    onCollegeChange?.(next);
    if (next) {
      startTransition(async () => {
        const res = await getCollegeStructureAction({ collegeId: next.id });
        if (res.ok) setStructure({ departments: res.departments, academic_programs: res.academic_programs });
      });
    }
  }

  return (
    <div className="space-y-5">
      <CollegePicker id="collegeId" value={college} onChange={onPick} error={errors.collegeId?.message} />

      {college && (departments.length > 0 || programs.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="departmentId" label="Department" optional>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => {
                    field.onChange(v === NONE ? null : v);
                    setValue("programId", null);
                  }}
                >
                  <SelectTrigger id="departmentId" className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not specified</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field id="programId" label="Course / degree" optional>
            <Controller
              control={control}
              name="programId"
              render={({ field }) => (
                <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
                  <SelectTrigger id="programId" className="w-full">
                    <SelectValue placeholder="Select program" />
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
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="graduationYear" label={accountType === "alumni" ? "Graduation year" : "Graduation year (expected)"} optional error={errors.graduationYear?.message}>
          <Input id="graduationYear" type="number" inputMode="numeric" min={1960} max={2100} placeholder="2027" aria-describedby="graduationYear-desc" {...register("graduationYear")} />
        </Field>
        {accountType === "student" && (
          <>
            <Field id="currentYear" label="Current year" optional error={errors.currentYear?.message} hint="Only shown if you allow it.">
              <Input id="currentYear" type="number" inputMode="numeric" min={1} max={8} placeholder="3" aria-describedby="currentYear-desc" {...register("currentYear")} />
            </Field>
            <Field id="currentSemester" label="Semester" optional error={errors.currentSemester?.message}>
              <Input id="currentSemester" type="number" inputMode="numeric" min={1} max={16} placeholder="5" aria-describedby="currentSemester-desc" {...register("currentSemester")} />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
