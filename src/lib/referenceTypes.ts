import { BookOpen, Link, Package, Target, Building2 } from "lucide-svelte";
import type { ReferenceTypeId } from "./types";

export interface ReferenceTypeOption {
  id: ReferenceTypeId;
  label: string;
  icon: typeof BookOpen;
  accentClass: string;
  bgClass: string;
  isDefault: boolean;
}

export const REFERENCE_TYPE_OPTIONS: ReferenceTypeOption[] = [
  {
    id: "characters",
    label: "Sources",
    icon: BookOpen,
    accentClass: "text-accent",
    bgClass: "bg-accent/20",
    isDefault: true,
  },
  {
    id: "locations",
    label: "References",
    icon: Link,
    accentClass: "text-spark-gold",
    bgClass: "bg-spark-gold/20",
    isDefault: true,
  },
  {
    id: "items",
    label: "Exhibits",
    icon: Package,
    accentClass: "text-success",
    bgClass: "bg-success/20",
    isDefault: false,
  },
  {
    id: "objectives",
    label: "Arguments",
    icon: Target,
    accentClass: "text-warning",
    bgClass: "bg-warning/20",
    isDefault: false,
  },
  {
    id: "organizations",
    label: "Theoretical Models",
    icon: Building2,
    accentClass: "text-text-secondary",
    bgClass: "bg-text-secondary/20",
    isDefault: false,
  },
];

export const DEFAULT_REFERENCE_TYPES: ReferenceTypeId[] = REFERENCE_TYPE_OPTIONS.filter(
  (option) => option.isDefault
).map((option) => option.id);

export function normalizeReferenceTypes(types?: string[] | null): ReferenceTypeId[] {
  if (!types) return DEFAULT_REFERENCE_TYPES;
  const allowed = new Set(REFERENCE_TYPE_OPTIONS.map((option) => option.id));
  const seen = new Set<ReferenceTypeId>();
  const result: ReferenceTypeId[] = [];

  for (const type of types) {
    if (allowed.has(type as ReferenceTypeId)) {
      const cast = type as ReferenceTypeId;
      if (!seen.has(cast)) {
        seen.add(cast);
        result.push(cast);
      }
    }
  }

  return result;
}
