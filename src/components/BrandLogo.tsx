import React from 'react';

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'h-8 w-8 rounded-xl',
  alt = 'klyn logo',
}) => {
  return (
    <img
      src="/assets/aistudio/image_99ec12b8.png"
      alt={alt}
      draggable={false}
      className={`object-cover select-none ${className}`}
    />
  );
};
