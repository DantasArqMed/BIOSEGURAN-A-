/**
 * User Classification & Contract Permission Helpers
 * Categorizes users into Admin, Internal Employee, and ASO Worker,
 * and handles secure, normalized contract filters.
 */

export const isAsoWorker = (u: any): boolean => {
  if (!u) return false;
  
  const isAsoUser = u.isAsoUser === true;
  const isSourceAso = u.source === "aso";
  const isPortalRoleFuncionario = u.portalRole === "funcionario";
  const isUserTypeAsoFuncionario = u.userType === "aso_funcionario";
  const isCreatedAutomaticallyWithEmail = u.createdAutomatically === true && u.email?.endsWith("@funcionario.arqmed.local");
  
  return isAsoUser || isSourceAso || isPortalRoleFuncionario || isUserTypeAsoFuncionario || isCreatedAutomaticallyWithEmail;
};

export const isInternalEmployee = (u: any): boolean => {
  if (!u) return false;
  
  if (u.tipo === 'admin' || u.role === 'admin') return true;

  const isAso = isAsoWorker(u);
  
  const hasInternalMark = u.isAsoUser === false || 
                          u.source === "app" || 
                          u.userType === "internal_employee" || 
                          ((u.role === "funcionario" || u.tipo === "funcionario") && !isAso);
  
  return hasInternalMark;
};

export const normalizeAreaName = (areaVal: string | null | undefined): string => {
  if (!areaVal) return "";
  return areaVal
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const canUserAccessContract = (userProfile: any, contract: any): boolean => {
  console.log("CONTRACT_PERMISSION_CHECK_START", { contractId: contract?.id });
  
  if (!userProfile) {
    console.log("CONTRACT_PERMISSION_USER", null);
    return false;
  }
  
  console.log("CONTRACT_PERMISSION_USER", { 
    uid: userProfile.uid, 
    email: userProfile.email, 
    tipo: userProfile.tipo, 
    role: userProfile.role,
    verContratos: userProfile.verContratos,
    cidade: userProfile.cidade
  });

  // 1. Check if user is ASO worker - absolutely forbidden (Aso cannot view contracts)
  if (isAsoWorker(userProfile)) {
    console.log("COMPANY_ACCESS_ASO_BLOCKED", userProfile.email);
    console.log("CONTRACT_ROUTE_BLOCKED_ASO_USER", userProfile.email);
    return false;
  }

  // 2. Admin has complete, unrestricted access
  if (userProfile.tipo === 'admin' || userProfile.role === 'admin') {
    console.log("COMPANY_ACCESS_ADMIN_ALLOWED", userProfile.email);
    console.log("CONTRACT_PERMISSION_ALL_ALLOWED", userProfile.email);
    return true;
  }

  // 3. Employee Permission Check
  console.log("COMPANY_ACCESS_INTERNAL_EMPLOYEE_ALLOWED", userProfile.email);
  const userPermission = userProfile.verContratos || userProfile.cidade || userProfile.permission || "Todos";
  const normUserPerm = normalizeAreaName(userPermission);
  console.log("EMPLOYEE_PERMISSION_DETECTED", { email: userProfile.email, rawPermission: userPermission, normalized: normUserPerm });

  // If "Todos" or empty, allow all
  if (normUserPerm === "todos" || normUserPerm === "todas" || normUserPerm === "") {
    console.log("COMPANY_ACCESS_PERMISSION_ALL", userProfile.email);
    console.log("CONTRACT_PERMISSION_ALL_ALLOWED", userProfile.email);
    return true;
  }

  if (normUserPerm === "nenhum") {
    console.log("CONTRACT_PERMISSION_AREA_DENIED", { contractId: contract.id, area: "Nenhum", userPermission });
    return false;
  }

  // 4. Resolve contract area with multi-field check and fallback
  let contractArea = "";
  const fieldsToCheck = [
    contract.cidade,
    contract.unidade,
    contract.area,
    contract.localidade,
    contract.filial,
    contract.formData?.cidadeEstado,
    contract.templateData?.CIDADE_ESTADO,
    contract.empresa
  ];

  for (const val of fieldsToCheck) {
    if (val && typeof val === 'string') {
      const normVal = normalizeAreaName(val);
      if (normVal.includes('campo grande')) {
        contractArea = 'Campo Grande';
        break;
      }
      if (normVal.includes('rondonopolis')) {
        contractArea = 'Rondonópolis';
        break;
      }
    }
  }

  // 5. Fallback for contracts without a defined area/unit
  if (contractArea === "") {
    console.warn("CONTRACT_WITHOUT_UNIT_WARNING", { 
      contractId: contract.id, 
      empresa: contract.empresa, 
      message: "Contrato antigo ou sem unidade definida. Aplicado fallback de liberação para não ocultar."
    });
    return true;
  }

  // 6. Match normalized fields
  const normContractArea = normalizeAreaName(contractArea);
  if (normUserPerm.includes(normContractArea) || normContractArea.includes(normUserPerm)) {
    console.log("COMPANY_ACCESS_PERMISSION_AREA", {
      area: contractArea,
      userPermission
    });
    console.log("CONTRACT_PERMISSION_AREA_ALLOWED", { 
      contractId: contract.id, 
      area: contractArea, 
      userPermission 
    });
    return true;
  }

  console.log("CONTRACT_PERMISSION_AREA_DENIED", { 
    contractId: contract.id, 
    area: contractArea, 
    userPermission 
  });
  return false;
};

export const canUserAccessCompany = (userProfile: any, company: any): boolean => {
  console.log("COMPANY_ACCESS_CHECK_START", { companyId: company?.cnpj });

  if (!userProfile) {
    return false;
  }

  if (isAsoWorker(userProfile)) {
    console.log("COMPANY_ACCESS_ASO_BLOCKED", userProfile.email);
    return false;
  }

  if (userProfile.tipo === 'admin' || userProfile.role === 'admin') {
    console.log("COMPANY_ACCESS_ADMIN_ALLOWED", userProfile.email);
    return true;
  }

  console.log("COMPANY_ACCESS_INTERNAL_EMPLOYEE_ALLOWED", userProfile.email);
  const userPermission = userProfile.verContratos || userProfile.cidade || userProfile.permission || "Todos";
  const normUserPerm = normalizeAreaName(userPermission);
  console.log("EMPLOYEE_PERMISSION_DETECTED", { email: userProfile.email, rawPermission: userPermission, normalized: normUserPerm });

  if (normUserPerm === "todos" || normUserPerm === "todas" || normUserPerm === "") {
    console.log("COMPANY_ACCESS_PERMISSION_ALL", userProfile.email);
    return true;
  }

  if (normUserPerm === "nenhum") {
    return false;
  }

  // Search company area in multi fields
  let companyArea = "";
  const fieldsToCheck = [
    company.cidadeEstado,
    company.cidade,
    company.unidade,
    company.localidade,
    company.nome,
    company.endereco,
    company.cnpj
  ];

  for (const val of fieldsToCheck) {
    if (val && typeof val === 'string') {
      const normVal = normalizeAreaName(val);
      if (normVal.includes('campo grande')) {
        companyArea = 'Campo Grande';
        break;
      }
      if (normVal.includes('rondonopolis')) {
        companyArea = 'Rondonópolis';
        break;
      }
    }
  }

  if (companyArea === "") {
    console.warn("COMPANY_WITHOUT_UNIT_WARNING", {
      cnpj: company.cnpj,
      nome: company.nome,
      cidadeEstado: company.cidadeEstado,
      message: "Empresa antiga ou sem unidade definida. Aplicado fallback de liberação para não ocultar."
    });
    return true;
  }

  const normCompanyArea = normalizeAreaName(companyArea);
  if (normUserPerm.includes(normCompanyArea) || normCompanyArea.includes(normUserPerm)) {
    console.log("COMPANY_ACCESS_PERMISSION_AREA", {
      cnpj: company.cnpj,
      area: companyArea,
      userPermission
    });
    return true;
  }

  return false;
};

// Automated Self-Audit Test Runner to verify security permissions on system load
export const runPermissionsSelfAudit = (): boolean => {
  console.log("--- STARTING PERMISSIONS SECURITY SELF-AUDIT ---");
  try {
    // 1. SCENARIO 1 — ADMIN
    const mockAdmin = { uid: "audit-admin-1", email: "admin@arqmed.com", tipo: "admin", status: "ativo" };
    const companyCG = { cnpj: "11.111.111/0001-11", cidade: "Campo Grande", nome: "Centro Médico Campo Grande" };
    const companyRoo = { cnpj: "22.222.222/0002-22", cidade: "rondonopolis", nome: "Clínica Rondonópolis" };
    const companyOld = { cnpj: "33.333.333/0003-33", nome: "Empresa Antiga Legada" }; // Empty area fallback
    
    const contractCG = { id: "cnt-1", empresa: "Centro Médico Campo Grande", cidade: "Campo Grande" };
    const contractRoo = { id: "cnt-2", empresa: "Clínica Rondonópolis", unidade: "Rondonópolis" };
    const contractOld = { id: "cnt-3", empresa: "Empresa Antiga Legada" }; // Empty area fallback

    const adminC1 = canUserAccessCompany(mockAdmin, companyCG);
    const adminC2 = canUserAccessCompany(mockAdmin, companyRoo);
    const adminC3 = canUserAccessCompany(mockAdmin, companyOld);
    const adminK1 = canUserAccessContract(mockAdmin, contractCG);
    const adminK2 = canUserAccessContract(mockAdmin, contractRoo);
    const adminK3 = canUserAccessContract(mockAdmin, contractOld);

    if (!adminC1 || !adminC2 || !adminC3 || !adminK1 || !adminK2 || !adminK3) {
      console.log("PERMISSION_TEST_FAILED", "Admin validation check failed");
      return false;
    }
    console.log("PERMISSION_TEST_ADMIN_OK");

    // 2. SCENARIO 2 — FUNCIONÁRIO ARQMED COM PERMISSÃO "TODOS"
    const mockEmpAll = { 
      uid: "audit-emp-all", 
      email: "funcionario.todos@arqmed.com", 
      tipo: "funcionario", 
      source: "app", 
      isAsoUser: false, 
      verContratos: "TODOS", 
      status: "ativo" 
    };

    const empAllC1 = canUserAccessCompany(mockEmpAll, companyCG);
    const empAllC2 = canUserAccessCompany(mockEmpAll, companyRoo);
    const empAllC3 = canUserAccessCompany(mockEmpAll, companyOld);
    const empAllK1 = canUserAccessContract(mockEmpAll, contractCG);
    const empAllK2 = canUserAccessContract(mockEmpAll, contractRoo);
    const empAllK3 = canUserAccessContract(mockEmpAll, contractOld);

    if (!empAllC1 || !empAllC2 || !empAllC3 || !empAllK1 || !empAllK2 || !empAllK3) {
      console.log("PERMISSION_TEST_FAILED", "Employee 'TODOS' validation check failed");
      return false;
    }
    console.log("PERMISSION_TEST_EMPLOYEE_ALL_OK");

    // 3. SCENARIO 3 — FUNCIONÁRIO ARQMED COM PERMISSÃO "Campo Grande"
    const mockEmpCGVariants = [
      { uid: "audit-emp-cg-1", email: "cg1@arqmed.com", tipo: "funcionario", source: "app", isAsoUser: false, verContratos: "Campo Grande", status: "ativo" },
      { uid: "audit-emp-cg-2", email: "cg2@arqmed.com", tipo: "funcionario", source: "app", isAsoUser: false, verContratos: "campo grande", status: "ativo" },
      { uid: "audit-emp-cg-3", email: "cg3@arqmed.com", tipo: "funcionario", source: "app", isAsoUser: false, verContratos: "CAMPO GRANDE", status: "ativo" }
    ];

    for (const mockCG of mockEmpCGVariants) {
      const cgC1 = canUserAccessCompany(mockCG, companyCG); // Should see Campo Grande
      const cgC2 = canUserAccessCompany(mockCG, companyRoo); // Should NOT see Rondonópolis
      const cgC3 = canUserAccessCompany(mockCG, companyOld); // Should see (fallback for empty units)

      const cgK1 = canUserAccessContract(mockCG, contractCG); // Should see Campo Grande
      const cgK2 = canUserAccessContract(mockCG, contractRoo); // Should NOT see Rondonópolis
      const cgK3 = canUserAccessContract(mockCG, contractOld); // Should see (fallback for empty units)

      if (!cgC1 || cgC2 || !cgC3 || !cgK1 || cgK2 || !cgK3) {
        console.log("PERMISSION_TEST_FAILED", `Employee 'Campo Grande' variant matching failed for UID: ${mockCG.uid}`);
        return false;
      }
    }
    console.log("PERMISSION_TEST_CAMPO_GRANDE_OK");

    // 4. SCENARIO 4 — FUNCIONÁRIO ARQMED COM PERMISSÃO "Rondonópolis"
    const mockEmpRooVariants = [
      { uid: "audit-emp-roo-1", email: "roo1@arqmed.com", tipo: "funcionario", source: "app", isAsoUser: false, verContratos: "Rondonópolis", status: "ativo" },
      { uid: "audit-emp-roo-2", email: "roo2@arqmed.com", tipo: "funcionario", source: "app", isAsoUser: false, verContratos: "Rondonopolis", status: "ativo" },
      { uid: "audit-emp-roo-3", email: "roo3@arqmed.com", tipo: "funcionario", source: "app", isAsoUser: false, verContratos: "rondonopolis", status: "ativo" }
    ];

    for (const mockRoo of mockEmpRooVariants) {
      const rooC1 = canUserAccessCompany(mockRoo, companyCG); // Should NOT see Campo Grande
      const rooC2 = canUserAccessCompany(mockRoo, companyRoo); // Should see Rondonópolis
      const rooC3 = canUserAccessCompany(mockRoo, companyOld); // Should see (fallback for empty units)

      const rooK1 = canUserAccessContract(mockRoo, contractCG); // Should NOT see Campo Grande
      const rooK2 = canUserAccessContract(mockRoo, contractRoo); // Should see Rondonópolis
      const rooK3 = canUserAccessContract(mockRoo, contractOld); // Should see (fallback for empty units)

      if (rooC1 || !rooC2 || !rooC3 || rooK1 || !rooK2 || !rooK3) {
        console.log("PERMISSION_TEST_FAILED", `Employee 'Rondonópolis' variant matching failed for UID: ${mockRoo.uid}`);
        return false;
      }
    }
    console.log("PERMISSION_TEST_RONDONOPOLIS_OK");

    // 5. SCENARIO 5 — FUNCIONÁRIO ASO (ABSOLUTE FORBIDDEN TARGET BLOCKED)
    const mockASO = { 
      uid: "audit-aso-1", 
      email: "trabalhador@gmail.com", 
      tipo: "aso_funcionario", 
      isAsoUser: true, 
      status: "ativo" 
    };

    const asoC1 = canUserAccessCompany(mockASO, companyCG);
    const asoC2 = canUserAccessCompany(mockASO, companyRoo);
    const asoC3 = canUserAccessCompany(mockASO, companyOld);
    const asoK1 = canUserAccessContract(mockASO, contractCG);
    const asoK2 = canUserAccessContract(mockASO, contractRoo);
    const asoK3 = canUserAccessContract(mockASO, contractOld);

    if (asoC1 || asoC2 || asoC3 || asoK1 || asoK2 || asoK3) {
      console.log("PERMISSION_TEST_FAILED", "ASO Worker scenario was not blocked successfully");
      return false;
    }
    console.log("PERMISSION_TEST_ASO_OK");

    console.log("--- PERMISSIONS SECURITY SELF-AUDIT COMPLETE: ALL PASS ---");
    return true;
  } catch (err) {
    console.log("PERMISSION_TEST_FAILED", err);
    return false;
  }
};

// Auto-run verification on system module loads to ensure continuous regression-safe protection
try {
  runPermissionsSelfAudit();
} catch (e) {
  console.warn("Auto self-audit call failed on initialize loads", e);
}

