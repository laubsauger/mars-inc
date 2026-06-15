// WebGPU-required screen (§C). React + Tailwind, no ad-hoc CSS.

export function Unsupported() {
  return (
    <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-pit/95 p-8 text-center font-mono text-bone">
      <div className="max-w-lg">
        <h1 className="mb-3 text-4xl font-bold tracking-widest text-ember">MARS PIT</h1>
        <p className="mb-2 text-lg">
          This game requires <strong className="text-ember">WebGPU</strong>.
        </p>
        <p className="text-sm text-bone/60">
          Use a current Chrome, Edge, or Safari Technology Preview and ensure hardware acceleration
          is enabled.
        </p>
      </div>
    </div>
  );
}
