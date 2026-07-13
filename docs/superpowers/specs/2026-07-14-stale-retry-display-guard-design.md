# Stale Retry Display Guard Design

## Goal

Prevent an image retry that completes after overlay navigation from replacing the image shown for a newer page, while retaining the successful retry result for the page that was actually fetched.

## Scope

This change is limited to the asynchronous completion path in `retryImage()` and its regression coverage. It does not change inactivity URL synchronization, normal page resolution, preload behavior, navigation direction, or spread pairing.

## Root Cause

`retryImage()` determines a target page and side before starting its fetch. On success it correctly stores the fetched image URL in `viewerDataCache` and `pageImageMap`, but then writes the result directly to the captured side of the current `spreadState`.

If the user advances, retreats, or seeks before the fetch completes, that side now represents another page. The stale completion therefore replaces a newer page image even though the page caches themselves remain keyed to the original target page.

## Design

The retry completion will keep its current cache writes. Before updating `spreadState`, it will derive the page currently represented by the captured side:

- The right side represents `virtualPage.value`.
- In spread mode, the left side represents the partner page returned by `getSpreadPageInfo()` for the current right page.
- In single-page mode, there is no current left-side page.

The completion updates `spreadState` only when that current side page still equals the retry target page. If navigation or a settings change has reassigned the side, the display write is skipped.

This page-identity check is preferred over a render-generation check because a harmless redraw of the same page should not discard a successful retry. It is preferred over rerendering the entire current spread because that would restart unrelated resolution and preload work.

## Data Flow

1. Capture the retry target page and requested side.
2. Fetch and parse the target viewer page as today.
3. Update `viewerDataCache` and `pageImageMap` for the target page and persist the maps.
4. Resolve the page currently assigned to the requested side.
5. Update `spreadState` only when the current side page matches the target page.

A stale response remains useful when the user later returns to its page because normal rendering reads the refreshed URL from `pageImageMap`.

## Error Handling

Fetch, HTTP, parse, and missing-image failures retain the existing behavior: they do not update caches or the display, and the promise rejection is contained by the existing catch path.

## Testing

Add a regression test that:

1. Displays a spread with a failed image and starts a deferred retry for that page.
2. Navigates to a fully cached newer spread before resolving the retry.
3. Resolves the old retry successfully.
4. Verifies that `viewerDataCache` and `pageImageMap` contain the retried image for the original page.
5. Verifies that `virtualPage` and both displayed image URLs remain on the newer spread.

The existing initial-render tests remain unchanged. The full repository quality gate, `npm run check`, must pass before the implementation commit.
