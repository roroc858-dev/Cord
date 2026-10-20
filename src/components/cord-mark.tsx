import Image from "next/image";

export function CordMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/cord-logo.png"
      alt=""
      aria-hidden="true"
      width={Math.round(size * 0.84)}
      height={size}
      priority
    />
  );
}
