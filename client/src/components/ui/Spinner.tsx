export default function Spinner({ size = 'md', label }: Readonly<{ size?: 'sm' | 'md'; label?: string }>) {
  return (
    <div className="loading-wrap">
      <span className={size === 'sm' ? 'spinner spinner--sm' : 'spinner'} />
      {label && <span>{label}</span>}
    </div>
  );
}