// Single home for the filesystem route-segment grammar ("[param]",
// "[...rest]", static) and its specificity ranking. Build-time discovery and
// runtime error-boundary resolution both consume this module so the grammar
// cannot drift between them.

export type RouteSegmentKind = "static" | "dynamic" | "catchall";

export interface ParsedRouteSegment {
	kind: RouteSegmentKind;
	raw: string;
	value: string;
}

export function parseRouteSegmentSyntax(segment: string): ParsedRouteSegment {
	if (segment.startsWith("[...") && segment.endsWith("]")) {
		return {
			kind: "catchall",
			raw: segment,
			value: segment.slice(4, -1),
		};
	}

	if (segment.startsWith("[") && segment.endsWith("]")) {
		return {
			kind: "dynamic",
			raw: segment,
			value: segment.slice(1, -1),
		};
	}

	return {
		kind: "static",
		raw: segment,
		value: segment,
	};
}

export function segmentSpecificity(kind: RouteSegmentKind): number {
	switch (kind) {
		case "static":
			return 3;
		case "dynamic":
			return 2;
		case "catchall":
			return 1;
	}
}
