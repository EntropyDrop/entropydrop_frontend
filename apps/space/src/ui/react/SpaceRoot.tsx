import React from 'react';
import { spaceUiMarkup } from './spaceUiMarkup.ts';

/**
 * React owns the complete 2D interface tree while the existing UIManager acts
 * as the engine adapter for its stable element IDs. Keeping the original HTML
 * as a colocated React asset preserves the exact DOM hierarchy and CSS contract
 * during the migration; dynamic engine-owned regions are updated in place and
 * this component deliberately never re-renders them.
 */
export const SpaceRoot = React.memo(function SpaceRoot() {
  return (
    <div
      id="space-ui-react-content"
      style={{ display: 'contents' }}
      dangerouslySetInnerHTML={{ __html: spaceUiMarkup }}
    />
  );
});
