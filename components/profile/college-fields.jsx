"use client";

import { Controller, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";

const NONE = "__none__";

/**
 * College + department + program + graduation year + (students) current year/semester.
 * `colleges` is [{ id, name, departments: [{id,name}], academic_programs: [{id,name,department_id}] }].
 */
export function CollegeFields({ control, register, setValue, errors, colleges, accountType }) {
  const collegeId = useWatch({ control, name: "collegeId" });
  const departmentId = useWatch({ control, name: "departmentId" });
  const college = colleges.find((c) => c.id === collegeId);
  const departments = college?.departments ?? [];
  const programs = (college?.academic_programs ?? []).filter((p) => !departmentId || !p.department_id || p.department_id === departmentId);

  return (
    <div className="space-y-4">
      <Field id="collegeId" label="College" required error={errors.collegeId?.message} hint="Changing college resets any verification badge.">
        <Controller
          control={control}
          name="collegeId"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(v) => {
                field.onChange(v);
                setValue("departmentId", null);
                setValue("programId", null);
              }}
            >
              <SelectTrigger id="collegeId" className="w-full" aria-invalid={Boolean(errors.collegeId)} aria-describedby="collegeId-desc">
                <SelectValue placeholder="Select your college" />
              </SelectTrigger>
              <SelectContent>
                {colleges.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

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
                disabled={!college}
              >
                <SelectTrigger id="departmentId" className="w-full">
                  <SelectValue placeholder={college ? "Select department" : "Choose a college first"} />
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
              <Select value={field.value ?? NONE} onValueChange={(v) => field.onChange(v === NONE ? null : v)} disabled={!college}>
                <SelectTrigger id="programId" className="w-full">
                  <SelectValue placeholder={college ? "Select program" : "Choose a college first"} />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="graduationYear" label={accountType === "alumni" ? "Graduation year" : "Expected graduation"} optional error={errors.graduationYear?.message}>
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
