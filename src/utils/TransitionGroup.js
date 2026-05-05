import React from 'react';

export default function TransitionGroup({children, component: Component = 'span', ...props}) {
  return <Component {...props}>{children}</Component>;
}
