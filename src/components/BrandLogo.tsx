import React from 'react';
import { KlynLogo } from './KlynLogo';

interface BrandLogoProps {
  className?: string;
  alt?: string;
  pulse?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'h-8 w-8 rounded-xl',
  alt = 'KLYN',
  pulse = false,
}) => {
  return <KlynLogo className={className} alt={alt} pulse={pulse} />;
};
