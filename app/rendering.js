// app/rendering.js - Draw functions and rendering pipeline

// Helper for generating agent colors
export function getAgentColor(id, alive = true) {
    // First 4 agents use classic colors for consistency
    const classicColors = {
        1: { alive: "#00ffff", dead: "#005555" },  // cyan
        2: { alive: "#ff00ff", dead: "#550055" },  // magenta
        3: { alive: "#ffff00", dead: "#555500" },  // yellow
        4: { alive: "#ff8800", dead: "#553300" },  // orange
    };

    if (id <= 4 && classicColors[id]) {
        return alive ? classicColors[id].alive : classicColors[id].dead;
    }

    // For agents beyond 4, use HSL with varying hue
    const hue = ((id - 1) * 137.5) % 360;
    const saturation = alive ? 1.0 : 0.3;
    const lightness = alive ? 0.5 : 0.2;
    const rgb = hslToRgb(hue, saturation, lightness);
    return rgbToHexString(rgb);
}

// Helper for getting RGB values for trail rendering
export function getAgentColorRGB(id) {
    const classicRGB = {
        1: { r: 0, g: 255, b: 255 },    // cyan
        2: { r: 255, g: 0, b: 255 },    // magenta
        3: { r: 255, g: 255, b: 0 },    // yellow
        4: { r: 255, g: 136, b: 0 }     // orange
    };

    if (id <= 4 && classicRGB[id]) {
        return classicRGB[id];
    }

    const hue = ((id - 1) * 137.5) % 360;
    return hslToRgb(hue, 1.0, 0.5);
}

function hslToRgb(hue, saturation, lightness) {
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - c / 2;

    let r, g, b;
    if (hue < 60) { r = c; g = x; b = 0; }
    else if (hue < 120) { r = x; g = c; b = 0; }
    else if (hue < 180) { r = 0; g = c; b = x; }
    else if (hue < 240) { r = 0; g = x; b = c; }
    else if (hue < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function rgbToHexString({ r, g, b }) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function drawLineageLinks(ctx, lineageLinks, bundles, globalTick, CONFIG) {
    if (!CONFIG.mitosis.showLineage || !lineageLinks || lineageLinks.length === 0) {
        return;
    }

    const maxDistance = CONFIG.mitosis.lineageMaxDistance || 500;
    const fadeDuration = CONFIG.mitosis.lineageFadeDuration || 600;
    const baseOpacity = CONFIG.mitosis.lineageOpacity || 0.4;
    const color = CONFIG.mitosis.lineageColor || "#888888";

    ctx.save();
    ctx.strokeStyle = color;

    lineageLinks.forEach(link => {
        const parent = bundles.find(b => b.id === link.parentId);
        const child = bundles.find(b => b.id === link.childId);

        if (!parent || !child) return;

        const dx = child.x - parent.x;
        const dy = child.y - parent.y;
        const dist = Math.hypot(dx, dy);

        if (dist > maxDistance) return;

        const age = globalTick - link.birthTick;
        const fadeProgress = Math.min(1, age / fadeDuration);
        const opacity = baseOpacity * (1 - fadeProgress * 0.7);

        if (opacity < 0.05) return;

        ctx.globalAlpha = opacity;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(child.x, child.y);
        ctx.stroke();
    });

    ctx.restore();
}

export function drawResourceTooltip(ctx, resource, World, CONFIG) {
    const padding = 8;
    const lineHeight = 16;
    const fontSize = 12;
    
    const lines = [
        `Resource #${World.resources.indexOf(resource) + 1}`,
        `Position: (${Math.round(resource.x)}, ${Math.round(resource.y)})`,
        `Radius: ${resource.r}px`,
        `Age: ${resource.age} ticks`,
        `Visible: ${resource.visible}`,
        `─────────────────────`,
        `Vitality: ${(resource.vitality || 0).toFixed(3)}`,
        `Status: ${resource.depleted ? 'DEPLETED' : 'Available'}`,
        `Depletion Threshold: ${CONFIG.scentGradient.depletionThreshold}`,
        `─────────────────────`,
        `Scent Strength: ${(resource.scentStrength || 0).toFixed(3)}`,
        `Scent Range: ${Math.round(resource.scentRange || 0)}px`,
        `Base Strength: ${CONFIG.scentGradient.strength}`,
        `Min Strength: ${CONFIG.scentGradient.minStrength}`,
        `Consumable: ${CONFIG.scentGradient.consumable ? 'Yes' : 'No'}`
    ];

    // Calculate tooltip dimensions
    ctx.save();
    ctx.font = `${fontSize}px ui-mono, monospace`;
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const tooltipWidth = maxWidth + padding * 2;
    const tooltipHeight = lines.length * lineHeight + padding * 2;

    // Position tooltip near resource but keep on screen
    let tooltipX = resource.x + 40;
    let tooltipY = resource.y - tooltipHeight / 2;

    if (tooltipX + tooltipWidth > ctx.canvas.width - 10) {
        tooltipX = resource.x - tooltipWidth - 40;
    }
    if (tooltipY < 10) tooltipY = 10;
    if (tooltipY + tooltipHeight > ctx.canvas.height - 10) {
        tooltipY = ctx.canvas.height - tooltipHeight - 10;
    }

    // Draw tooltip background
    ctx.fillStyle = 'rgba(12, 12, 16, 0.95)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    // Draw border
    ctx.strokeStyle = resource.depleted ? '#ff4444' : (CONFIG.scentGradient.consumable ? '#00ff88' : '#888');
    ctx.lineWidth = 2;
    ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    // Draw text
    lines.forEach((line, i) => {
        // Color-code important values
        if (line.includes('Vitality:')) {
            const vitality = resource.vitality || 0;
            const threshold = CONFIG.scentGradient.depletionThreshold;
            if (vitality <= threshold) {
                ctx.fillStyle = '#ff4444';
            } else if (vitality < 0.6) {
                const g = Math.round(140 + (vitality - threshold) * 200);
                ctx.fillStyle = `rgb(255, ${g}, 0)`;
            } else {
                const g = Math.round(155 + vitality * 100);
                ctx.fillStyle = `rgb(0, ${g}, 88)`;
            }
        } else if (line.includes('Status:')) {
            ctx.fillStyle = resource.depleted ? '#ff4444' : '#00ff88';
        } else if (line.includes('Scent Strength:')) {
            const strength = resource.scentStrength || 0;
            const minStrength = CONFIG.scentGradient.minStrength;
            const baseStrength = CONFIG.scentGradient.strength;
            const ratio = (strength - minStrength) / (baseStrength - minStrength);
            const r = Math.round(255 * (1 - ratio));
            const g = Math.round(255 * ratio);
            ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
        } else if (line.includes('───')) {
            ctx.fillStyle = '#666';
        } else {
            ctx.fillStyle = '#e6f3ec';
        }

        ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
    });

    // Draw connector line
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(resource.x, resource.y);
    ctx.lineTo(tooltipX, tooltipY + tooltipHeight / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

export function renderFrame(ctx, world, CONFIG, systems) {
    const { Trail, FertilityField, SignalField, Links, mousePos } = systems;
    
    // Clear background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw fertility grid if enabled
    if (systems.inputState.showFertility && CONFIG.plantEcology.enabled && FertilityField) {
        FertilityField.draw(ctx);
    }

    // Draw scent visualization if enabled
    if (systems.inputState.showScentGradient && CONFIG.scentGradient.enabled) {
        // systems.visualizeScentHeatmap(ctx, world.resources, 40); // Removed green background
        systems.visualizeScentGradient(ctx, world.resources, 80);
    }

    // Draw signal field
    if (CONFIG.signal.enabled && SignalField) {
        SignalField.draw(ctx);
    }

    // Draw trail system
    if (Trail) {
        Trail.draw();
    }

    // Draw resources
    world.resources.forEach(res => res.draw());

    // Draw resource tooltip if hovering
    if (mousePos?.hoveredResource) {
        drawResourceTooltip(ctx, mousePos.hoveredResource, world, CONFIG);
    }

    // Draw participation visualization
    if (systems.ParticipationManager?.draw) {
        try {
            systems.ParticipationManager.draw(ctx);
        } catch (error) {
            if (CONFIG?.participation?.debugLog) {
                console.debug('[Participation] draw error:', error);
            }
        }
    }

    // Draw agent links
    if (Links?.length) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        Links.forEach(L => {
            const a = world.bundles.find(b => b.id === L.aId);
            const b = world.bundles.find(b => b.id === L.bId);
            if (!a || !b) return;
            
            ctx.strokeStyle = getAgentColor(L.aId, true);
            ctx.lineWidth = Math.max(1, L.strength * 2);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        });
        ctx.restore();
    }

    // Draw lineage links if enabled
    if (CONFIG.mitosis.showLineage && world.lineageLinks) {
        drawLineageLinks(ctx, world.lineageLinks, world.bundles, systems.globalTick, CONFIG);
    }

    // Draw all agents
    world.bundles.forEach(bundle => bundle.draw());

    // Draw HUD overlay
    if (systems.drawHUD) {
        systems.drawHUD(ctx, world, systems);
    }

    // Draw rule110 overlay if enabled
    if (CONFIG.tcResourceIntegration?.showOverlay && window.rule110Stepper) {
        systems.drawRule110Overlay(ctx, window.rule110Stepper, ctx.canvas.width, ctx.canvas.height);
    }

    // Render PixiJS stage and composite with canvas
    systems.pixiApp.render();
    ctx.drawImage(systems.pixiApp.view, 0, 0, ctx.canvas.width, ctx.canvas.height);
}