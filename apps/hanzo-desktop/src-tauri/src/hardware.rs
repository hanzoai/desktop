use serde::Serialize;
use sysinfo::System;
use wgpu::DeviceType;

#[derive(Serialize, Debug)]
pub struct Hardware {
    pub cpus: usize,
    pub memory: u64,
    pub discrete_gpu: bool,
}

#[derive(Serialize, Debug)]
pub struct Requirement {
    cpus: usize,
    memory: u64,
    discrete_gpu: bool,
}

#[derive(Serialize, Debug)]
pub struct Requirements {
    still_usable: Requirement,
    minimum: Requirement,
    recommended: Requirement,
    optimal: Requirement,
}

#[derive(Serialize, Debug)]
pub enum RequirementsStatus {
    Unmeet,
    StillUsable,
    Minimum,
    Recommended,
    Optimal,
}

#[derive(Serialize, Debug)]
pub struct HardwareSummary {
    pub hardware: Hardware,
    pub requirements: Requirements,
    pub requirements_status: RequirementsStatus,
}

pub const STILL_USABLE_CPUS: usize = 4;
pub const STILL_USABLE_MEMORY: u64 = 8;
pub const MIN_CPUS: usize = 4;
pub const MIN_MEMORY: u64 = 16;
pub const RECOMMENDED_CPUS: usize = 10;
pub const RECOMMENDED_MEMORY: u64 = 32;
pub const REQUIREMENTS: Requirements = Requirements {
    still_usable: Requirement {
        cpus: STILL_USABLE_CPUS,
        memory: STILL_USABLE_MEMORY,
        discrete_gpu: false,
    },
    minimum: Requirement {
        cpus: MIN_CPUS,
        memory: MIN_MEMORY,
        discrete_gpu: false,
    },
    recommended: Requirement {
        cpus: RECOMMENDED_CPUS,
        memory: RECOMMENDED_MEMORY,
        discrete_gpu: false,
    },
    optimal: Requirement {
        cpus: RECOMMENDED_CPUS,
        memory: RECOMMENDED_MEMORY,
        discrete_gpu: true,
    },
};

fn get_total_vram(adapter: &wgpu::Adapter) -> u64 {
    if adapter.get_info().device_type != DeviceType::DiscreteGpu {
        let mut sys = System::new_all();
        sys.refresh_all();
        return sys.total_memory() / 1024 / 1024 / 1024;
    }

    let features = adapter.features();
    if features.contains(wgpu::Features::TEXTURE_ADAPTER_SPECIFIC_FORMAT_FEATURES) {
        let limits = adapter.limits();
        limits.max_texture_dimension_1d as u64 * limits.max_texture_dimension_2d as u64 * 4
    } else {
        0
    }
}

/// Detect NVIDIA accelerators that wgpu may classify as integrated (e.g. the
/// GB10 in DGX Spark, which uses unified memory) or miss entirely on headless
/// systems without a usable Vulkan/GL ICD.
fn has_nvidia_gpu() -> bool {
    std::path::Path::new("/dev/nvidia0").exists()
        || std::path::Path::new("/proc/driver/nvidia/gpus").exists()
}

pub fn hardware_get_summary() -> HardwareSummary {
    let instance = wgpu::Instance::default();
    let adapters = instance.enumerate_adapters(wgpu::Backends::all());
    let adapter = adapters
        .iter()
        .find(|adapter| adapter.get_info().device_type == wgpu::DeviceType::DiscreteGpu)
        .or_else(|| adapters.first());

    // Treat NVIDIA accelerators as discrete-class even when reported as
    // integrated (unified memory, e.g. DGX Spark's GB10) so they aren't flagged
    // as unsupported. Detect via driver presence or any adapter named "nvidia".
    let nvidia_gpu = has_nvidia_gpu()
        || adapters
            .iter()
            .any(|a| a.get_info().name.to_lowercase().contains("nvidia"));

    let discrete_gpu = nvidia_gpu
        || adapter
            .map(|a| a.get_info().device_type == DeviceType::DiscreteGpu)
            .unwrap_or(false);
    let is_macos = cfg!(target_os = "macos");

    let mut sys = System::new_all();
    sys.refresh_all();

    // v memory in GB
    let memory = match adapter {
        Some(a) => get_total_vram(a),
        None => sys.total_memory() / 1024 / 1024 / 1024,
    };
    let cpus = sys.cpus().len();

    let requirement_status;
    if is_macos || (cpus >= RECOMMENDED_CPUS && memory >= RECOMMENDED_MEMORY && discrete_gpu) {
        requirement_status = RequirementsStatus::Optimal;
    } else if cpus >= RECOMMENDED_CPUS && memory >= RECOMMENDED_MEMORY {
        requirement_status = RequirementsStatus::Recommended;
    } else if cpus >= MIN_CPUS && memory >= MIN_MEMORY {
        requirement_status = RequirementsStatus::Minimum;
    } else if cpus >= STILL_USABLE_CPUS && memory >= STILL_USABLE_MEMORY {
        requirement_status = RequirementsStatus::StillUsable;
    } else {
        requirement_status = RequirementsStatus::Unmeet;
    }

    HardwareSummary {
        hardware: Hardware {
            cpus,
            memory,
            discrete_gpu,
        },
        requirements: REQUIREMENTS,
        requirements_status: requirement_status,
    }
}
