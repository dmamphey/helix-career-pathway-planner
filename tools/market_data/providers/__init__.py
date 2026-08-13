"""External data providers. Each one reports availability honestly and never
fabricates a response when its source or credential is missing."""

from . import ncs, nhs, ons, skills_england  # noqa: F401
