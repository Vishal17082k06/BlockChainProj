from fastapi import HTTPException, Request


def require_network(request: Request, net: str):
    """The usable network context for `net`, or a clear HTTP error."""
    ctx = request.app.state.registry.get(net)
    if ctx is None:
        raise HTTPException(404, f"Unknown network '{net}'")
    reason = ctx.unavailable_reason()
    if reason:
        raise HTTPException(503, reason)
    return ctx
