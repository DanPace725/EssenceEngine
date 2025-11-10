// app/initialization.js - Setup and bootstrap module
import { CONFIG } from '../config.js';
import { SignalField } from '../signalField.js';
import { HeuristicController, LinearPolicyController } from '../controllers.js';
import { RewardTracker, EpisodeManager, updateFindTimeEMA, calculateAdaptiveReward } from '../rewards.js';
import { CEMLearner, TrainingManager } from '../learner.js';
import { TrainingUI } from '../trainingUI.js';
import { FertilityGrid } from '../plantEcology.js';
import { SignalResponseAnalytics } from '../analysis/signalResponseAnalytics.js';
import { TcScheduler, TcRandom, TcStorage } from '../tcStorage.js';
import { createBundleClass } from '../src/core/bundle.js';
import { createResourceClass } from '../src/core/resource.js';
import { createWorld } from '../src/core/world.js';
import { initializeCanvasManager } from '../src/ui/canvasManager.js';
import { initializeInputManager } from '../src/ui/inputManager.js';
import { createTrainingModule } from '../src/core/training.js';
import { MetricsTracker } from '../src/core/metricsTracker.js';

export function initializeEngine(canvas) {
    // Initialize canvas and context
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    let canvasWidth = window.innerWidth;
    let canvasHeight = window.innerHeight;
    let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));

    // Initialize PixiJS setup
    const pixiApp = new PIXI.Application({
        width: canvasWidth,
        height: canvasHeight,
        backgroundAlpha: 0,
        resolution: dpr,
        autoDensity: true,
        autoStart: false,
        antialias: true,
        powerPreference: 'high-performance'
    });

    // Create container hierarchy
    const resourcesContainer = new PIXI.Container();
    const agentTrailsContainer = new PIXI.Container();
    const agentsContainer = new PIXI.Container();
    resourcesContainer.sortableChildren = true;
    agentTrailsContainer.sortableChildren = true;
    agentsContainer.sortableChildren = true;

    pixiApp.stage.addChild(resourcesContainer);
    pixiApp.stage.addChild(agentTrailsContainer);
    pixiApp.stage.addChild(agentsContainer);

    // Global systems
    const globalTick = 0;
    const Ledger = {
        credits: {},
        credit(authorId, amount) { this.credits[authorId] = (this.credits[authorId] || 0) + amount; },
        getCredits(authorId) { return this.credits[authorId] || 0; }
    };

    const Links = [];
    let FertilityField = null;

    // Initialize canvas manager
    const canvasManager = initializeCanvasManager({
        canvas,
        ctx,
        getAvailableSize: () => {
            const configPanel = document.getElementById("config-panel");
            const panelOpen = configPanel && configPanel.style.display !== "none";
            const panelWidth = panelOpen ? 360 : 0;
            return {
                width: window.innerWidth - panelWidth,
                height: window.innerHeight,
                panelWidth,
                topReserve: 0
            };
        }
    });

    // Initialize input system
    const { held, state: inputState } = initializeInputManager({
        canvas,
        getWorld: () => World,
        getTrail: () => Trail,
        getSignalField: () => SignalField,
        getTrainingUI: () => window.trainingUI,
        CONFIG
    });

    // Initialize core classes with dependencies
    const Bundle = createBundleClass({
        Trail,
        getGlobalTick: () => globalTick,
        getCanvasWidth: () => canvasWidth,
        getCanvasHeight: () => canvasHeight,
        Ledger,
        held,
        getAgentsContainer: () => agentsContainer,
        getAgentTrailsContainer: () => agentTrailsContainer,
        getWorld: () => World
    });

    const Resource = createResourceClass({
        getGlobalTick: () => globalTick,
        getCanvasWidth: () => canvasWidth,
        getCanvasHeight: () => canvasHeight,
        getFertilityField: () => FertilityField,
        getResourcesContainer: () => resourcesContainer
    });

    // Initialize World
    const World = createWorld({
        Trail,
        getCanvasWidth: () => canvasWidth,
        getCanvasHeight: () => canvasHeight,
        getGlobalTick: () => globalTick,
        Ledger,
        Links,
        Bundle,
        Resource
    });

    // Initialize training systems
    const learner = new CEMLearner(23, 3);
    const episodeManager = new EpisodeManager();

    const trainingModule = createTrainingModule({
        world: World,
        config: CONFIG,
        trail: Trail,
        signalField: SignalField,
        tcScheduler: TcScheduler,
        ledger: Ledger,
        episodeManager,
        learner,
        TrainingManagerClass: TrainingManager,
        TrainingUIClass: TrainingUI,
        getGlobalTick: () => globalTick
    });

    // Handle resizing
    canvasManager.onResize(({ width, height, dpr }) => {
        if (Trail && Trail.resize) {
            Trail.resize();
        }

        if (SignalField && SignalField.resize) {
            SignalField.resize(width, height, ctx);
        }

        if (CONFIG.plantEcology.enabled && typeof FertilityGrid !== 'undefined') {
            FertilityField = new FertilityGrid(width, height);
        }

        pixiApp.renderer.resolution = dpr;
        pixiApp.renderer.resize(width, height);
    });

    // Initial resize call
    canvasManager.resizeCanvas();

    // Expose key systems globally for debugging
    if (typeof window !== 'undefined') {
        window.World = World;
        window.Trail = Trail;
        window.SignalField = SignalField;
        window.FertilityField = FertilityField;
        window.CONFIG = CONFIG;
        window.TcRandom = TcRandom;
        window.TcStorage = TcStorage;
        window.pixiApp = pixiApp;
    }

    return {
        World,
        Trail,
        SignalField,
        FertilityField,
        canvasManager,
        inputState,
        pixiApp,
        resourcesContainer,
        agentTrailsContainer,
        agentsContainer,
        Links,
        Ledger,
        trainingModule
    };
}