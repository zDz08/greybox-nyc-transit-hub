import React from "react";

function EquipmentRow({ item, status, defaultType = "Elevator" }) {
    const type =
        item.type === "ES"
            ? "Escalator"
            : item.type === "EL"
                ? "Elevator"
                : defaultType;

    return (
        <details className="access-equipment">
            <summary>
                <span className="access-equipment__identity">
                    <strong>{item.equipment || type}</strong>
                    <small>
                        {type}
                        {item.isAda ? " · ADA" : ""}
                    </small>
                </span>

                <span
                    className="access-equipment__status"
                    data-status={status}
                >
                    {status === "outage"
                        ? "Out of service"
                        : status === "planned"
                            ? "Planned work"
                            : "Available"}
                </span>
            </summary>

            <div className="access-equipment__body">
                {item.serving && (
                    <p className="access-equipment__location">
                        {item.serving}
                    </p>
                )}

                <dl>
                    {item.reason && (
                        <>
                            <dt>Reason</dt>
                            <dd>{item.reason}</dd>
                        </>
                    )}

                    {item.outageDate && (
                        <>
                            <dt>Start</dt>
                            <dd>{item.outageDate}</dd>
                        </>
                    )}

                    {item.estimatedReturnToService && (
                        <>
                            <dt>Estimated return</dt>
                            <dd>{item.estimatedReturnToService}</dd>
                        </>
                    )}
                </dl>

                {item.alternativeRoute && (
                    <div className="access-equipment__alternative">
                        <strong>Alternative access</strong>
                        <p>{item.alternativeRoute}</p>
                    </div>
                )}
            </div>
        </details>
    );
}

export default function AccessibilityDetails({
    accessibility,
    label,
    contextNote,
    notes,
}) {
    const acc = accessibility;

    if (!acc) {
        return <p>Accessibility details unavailable.</p>;
    }

    const outageKnown = acc.outageFeedAvailable !== false;
    const equipmentKnown = acc.equipmentFeedAvailable !== false;

    const outages = [
        ...(acc.elevatorsOutOfService ?? []).map((item) => ({
            ...item,
            type: "EL",
        })),
        ...(acc.escalatorsOutOfService ?? []).map((item) => ({
            ...item,
            type: "ES",
        })),
    ];

    const available = acc.availableElevators ?? [];
    const upcoming = acc.upcomingOutages ?? [];

    return (
        <section
            className="access-details"
            aria-label="Elevator and escalator accessibility"
        >
            <div className="access-details__overview">
                <strong>{label || "Accessibility status unavailable"}</strong>
                {contextNote && <p>{contextNote}</p>}
            </div>

            {notes && (
                <details className="access-details__notes">
                    <summary>Station access notes</summary>
                    <p>{notes}</p>
                </details>
            )}

            {!outageKnown ? (
                <p role="status">
                    Equipment outage updates are unavailable.
                </p>
            ) : (
                <>
                    {outages.length > 0 ? (
                        <details className="access-group" open>
                            <summary>
                                Current outages
                                <span>{outages.length}</span>
                            </summary>

                            <div className="access-group__items">
                                {outages.map((item, index) => (
                                    <EquipmentRow
                                        key={`${item.equipment}-${index}`}
                                        item={item}
                                        status="outage"
                                    />
                                ))}
                            </div>
                        </details>
                    ) : (
                        <p className="access-details__clear">
                            {acc.hasOutage
                                ? "An outage is reported, but equipment details are unavailable."
                                : "No active equipment outages reported."}
                        </p>
                    )}

                    {equipmentKnown ? (
                        <details className="access-group">
                            <summary>
                                Available elevators
                                <span>{available.length}</span>
                            </summary>

                            <div className="access-group__items">
                                {available.length ? available.map((item, index) => (
                                    <EquipmentRow
                                        key={`${item.equipment}-${index}`}
                                        item={item}
                                        status="available"
                                    />
                                )) : (
                                    <p>No available elevators listed.</p>
                                )}
                            </div>
                        </details>
                    ) : (
                        <p>Elevator inventory is unavailable.</p>
                    )}

                    {upcoming.length > 0 && (
                        <details className="access-group">
                            <summary>
                                Planned maintenance
                                <span>{upcoming.length}</span>
                            </summary>

                            <div className="access-group__items">
                                {upcoming.map((item, index) => (
                                    <EquipmentRow
                                        key={`${item.equipment}-${index}`}
                                        item={item}
                                        status="planned"
                                        defaultType="Equipment"
                                    />
                                ))}
                            </div>
                        </details>
                    )}
                </>
            )}
        </section>
    );
}