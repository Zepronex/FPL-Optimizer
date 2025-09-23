interface SkeletonLoaderProps {
  className?: string;
  lines?: number;
}

const SkeletonLoader = ({ className = '', lines = 1 }: SkeletonLoaderProps) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className="loading-skeleton h-4 w-full"
          style={{
            animationDelay: `${index * 0.1}s`
          }}
        />
      ))}
    </div>
  );
};

export default SkeletonLoader;
