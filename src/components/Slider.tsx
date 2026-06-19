import { type ChangeEvent } from "react";

export type SliderProps = Omit<
  React.ComponentProps<"input">,
  "onChange" | "value"
> & {
  label: string;
  sub: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
};

export function SliderRow({ label, sub, value, onChange, color }: SliderProps) {
  return (
    <div className="mb-5">
      <div className="flex justify-between mb-2">
        <span className="text-lg font-medium">
          {label} <span className="">({sub})</span>
        </span>
        <span className={`text-[13px] font-bold font-mono ${color}`}>
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(parseFloat(e.target.value))
        }
        className="w-full h-1 rounded-full bg-gray-400 appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color === "text-blue-400" ? "#3b82f6" : "#22c55e"} 0%, ${color === "text-blue-400" ? "#3b82f6" : "#22c55e"} ${value * 100}%, #1e293b ${value * 100}%, #1e293b 100%)`,
          accentColor: color === "text-blue-400" ? "#3b82f6" : "#22c55e",
        }}
      />
    </div>
  );
}
