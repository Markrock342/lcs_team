import Image from "next/image";

const SIZES = {
  xs: 32,
  sm: 40,
  md: 56,
  lg: 100,
  xl: 140,
} as const;

export function Logo({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];

  return (
    <Image
      src="/icon.svg"
      alt="Limit Code Studio"
      width={px}
      height={px}
      className={`object-contain ${className}`}
      priority={size === "lg" || size === "xl"}
    />
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full border border-accent/40 bg-brand-glow ${className}`}
    >
      <Logo size="sm" />
    </div>
  );
}
