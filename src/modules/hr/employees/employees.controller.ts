import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AddEmployeeDocumentDto } from './dtos/add-employee-document.dto';
import { ChangeEmployeeStatusDto } from './dtos/change-employee-status.dto';
import { CreateEmployeeAddressDto } from './dtos/create-employee-address.dto';
import { CreateEmployeeAcademicQualificationDto } from './dtos/create-employee-academic-qualification.dto';
import { CreateEmployeeBankAccountDto } from './dtos/create-employee-bank-account.dto';
import { CreateEmployeeContactDto } from './dtos/create-employee-contact.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { CreateEmployeeExperienceDto } from './dtos/create-employee-experience.dto';
import { CreateEmployeeIdentificationDto } from './dtos/create-employee-identification.dto';
import { CreateEmployeeProfessionalQualificationDto } from './dtos/create-employee-professional-qualification.dto';
import { CreateEmployeeRelativeDto } from './dtos/create-employee-relative.dto';
import { EmployeeQueryDto } from './dtos/employee-query.dto';
import { UpdateEmployeeAddressDto } from './dtos/update-employee-address.dto';
import { UpdateEmployeeAcademicQualificationDto } from './dtos/update-employee-academic-qualification.dto';
import { UpdateEmployeeBankAccountDto } from './dtos/update-employee-bank-account.dto';
import { UpdateEmployeeContactDto } from './dtos/update-employee-contact.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { UpdateEmployeeExperienceDto } from './dtos/update-employee-experience.dto';
import { UpdateEmployeeIdentificationDto } from './dtos/update-employee-identification.dto';
import { UpdateEmployeeProfessionalQualificationDto } from './dtos/update-employee-professional-qualification.dto';
import { UpdateEmployeeRelativeDto } from './dtos/update-employee-relative.dto';
import { EmployeesService } from './employees.service';
import {
  ApiCreateOperation,
  ApiDeleteOperation,
  ApiGetOneOperation,
  ApiListOperation,
  ApiUpdateOperation,
  ApiOperationSummary,
  ApiAuthRequired,
  ApiSuccessResponse,
  ApiValidationErrorResponse,
  ApiNotFoundResponse,
} from '../../../docs/swagger-decorators';

@ApiTags('Employees')
@ApiBearerAuth('access-token')
@Controller('employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  // ════════════════════════════════════════════
  //  CORE PROFILE CRUD
  // ════════════════════════════════════════════

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:create')
  @ApiCreateOperation('Employee', 'Create an employee profile for a company user')
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(
      req.user.companyId!,
      createEmployeeDto,
      req.user,
    );
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiListOperation('Employee', 'List employees in the active company')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findAll(req.user.companyId!, query, req.user);
  }

  @Get('me')
  @ApiOperationSummary(
    'Get my employee profile',
    'Returns the full employee profile of the currently authenticated company user.',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('Employee')
  @ApiSuccessResponse(200, 'Employee profile retrieved successfully')
  findMe(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.employeesService.findMyProfile(
      req.user.companyId!,
      req.user.id,
    );
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiGetOneOperation('Employee', 'Get a full employee profile by ID')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiUpdateOperation('Employee', 'Update an employee profile')
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(
      req.user.companyId!,
      id,
      updateEmployeeDto,
      req.user,
    );
  }

  @Patch(':id/status')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:change-status')
  @ApiOperationSummary(
    'Change employee lifecycle status',
    'Updates the employment status (e.g. active, terminated, resigned) of an employee.',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('Employee')
  @ApiSuccessResponse(200, 'Employee status updated')
  changeStatus(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() changeEmployeeStatusDto: ChangeEmployeeStatusDto,
  ) {
    return this.employeesService.changeStatus(
      req.user.companyId!,
      id,
      changeEmployeeStatusDto,
      req.user,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:delete')
  @ApiDeleteOperation('Employee', 'Delete an employee profile')
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.remove(req.user.companyId!, id, req.user);
  }

  // ════════════════════════════════════════════
  //  DOCUMENTS
  // ════════════════════════════════════════════

  @Post(':id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary(
    'Attach a document to an employee profile',
    'Adds a new document record linked to the specified employee.',
  )
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiNotFoundResponse('Employee')
  @ApiSuccessResponse(201, 'Document attached successfully')
  addDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() addEmployeeDocumentDto: AddEmployeeDocumentDto,
  ) {
    return this.employeesService.addDocument(
      req.user.companyId!,
      id,
      addEmployeeDocumentDto,
      req.user,
    );
  }

  @Delete(':employeeId/documents/:documentId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary(
    'Remove an employee document',
    'Permanently removes a document record from an employee profile.',
  )
  @ApiAuthRequired()
  @ApiNotFoundResponse('Employee or Document')
  @ApiSuccessResponse(200, 'Document removed successfully')
  removeDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.employeesService.removeDocument(
      req.user.companyId!,
      employeeId,
      documentId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  CONTACTS
  // ════════════════════════════════════════════

  @Post(':employeeId/contacts')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add a contact to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Contact added successfully')
  addContact(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeContactDto,
  ) {
    return this.employeesService.addContact(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/contacts/:contactId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an employee contact')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Contact updated successfully')
  updateContact(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() dto: UpdateEmployeeContactDto,
  ) {
    return this.employeesService.updateContact(
      req.user.companyId!,
      employeeId,
      contactId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/contacts/:contactId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an employee contact')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Contact removed successfully')
  removeContact(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    return this.employeesService.removeContact(
      req.user.companyId!,
      employeeId,
      contactId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  ADDRESSES
  // ════════════════════════════════════════════

  @Post(':employeeId/addresses')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add an address to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Address added successfully')
  addAddress(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeAddressDto,
  ) {
    return this.employeesService.addAddress(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/addresses/:addressId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an employee address')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Address updated successfully')
  updateAddress(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('addressId', ParseIntPipe) addressId: number,
    @Body() dto: UpdateEmployeeAddressDto,
  ) {
    return this.employeesService.updateAddress(
      req.user.companyId!,
      employeeId,
      addressId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/addresses/:addressId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an employee address')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Address removed successfully')
  removeAddress(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('addressId', ParseIntPipe) addressId: number,
  ) {
    return this.employeesService.removeAddress(
      req.user.companyId!,
      employeeId,
      addressId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  RELATIVES
  // ════════════════════════════════════════════

  @Post(':employeeId/relatives')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add a relative to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Relative added successfully')
  addRelative(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeRelativeDto,
  ) {
    return this.employeesService.addRelative(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/relatives/:relativeId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an employee relative')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Relative updated successfully')
  updateRelative(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('relativeId', ParseIntPipe) relativeId: number,
    @Body() dto: UpdateEmployeeRelativeDto,
  ) {
    return this.employeesService.updateRelative(
      req.user.companyId!,
      employeeId,
      relativeId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/relatives/:relativeId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an employee relative')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Relative removed successfully')
  removeRelative(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('relativeId', ParseIntPipe) relativeId: number,
  ) {
    return this.employeesService.removeRelative(
      req.user.companyId!,
      employeeId,
      relativeId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  IDENTIFICATIONS
  // ════════════════════════════════════════════

  @Post(':employeeId/identifications')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add an identification document to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Identification added successfully')
  addIdentification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeIdentificationDto,
  ) {
    return this.employeesService.addIdentification(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/identifications/:identificationId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an employee identification')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Identification updated successfully')
  updateIdentification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('identificationId', ParseIntPipe) identificationId: number,
    @Body() dto: UpdateEmployeeIdentificationDto,
  ) {
    return this.employeesService.updateIdentification(
      req.user.companyId!,
      employeeId,
      identificationId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/identifications/:identificationId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an employee identification')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Identification removed successfully')
  removeIdentification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('identificationId', ParseIntPipe) identificationId: number,
  ) {
    return this.employeesService.removeIdentification(
      req.user.companyId!,
      employeeId,
      identificationId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  BANK ACCOUNTS
  // ════════════════════════════════════════════

  @Post(':employeeId/bank-accounts')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add a bank account to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Bank account added successfully')
  addBankAccount(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeBankAccountDto,
  ) {
    return this.employeesService.addBankAccount(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/bank-accounts/:bankAccountId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an employee bank account')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Bank account updated successfully')
  updateBankAccount(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('bankAccountId', ParseIntPipe) bankAccountId: number,
    @Body() dto: UpdateEmployeeBankAccountDto,
  ) {
    return this.employeesService.updateBankAccount(
      req.user.companyId!,
      employeeId,
      bankAccountId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/bank-accounts/:bankAccountId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an employee bank account')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Bank account removed successfully')
  removeBankAccount(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('bankAccountId', ParseIntPipe) bankAccountId: number,
  ) {
    return this.employeesService.removeBankAccount(
      req.user.companyId!,
      employeeId,
      bankAccountId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  ACADEMIC QUALIFICATIONS
  // ════════════════════════════════════════════

  @Get(':employeeId/academic-qualifications')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperationSummary('List academic qualifications for an employee')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Academic qualifications retrieved')
  listAcademicQualifications(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.employeesService.listAcademicQualifications(
      req.user.companyId!,
      employeeId,
      req.user,
    );
  }

  @Post(':employeeId/academic-qualifications')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add an academic qualification to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Academic qualification added successfully')
  addAcademicQualification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeAcademicQualificationDto,
  ) {
    return this.employeesService.addAcademicQualification(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/academic-qualifications/:academicQualificationId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an academic qualification')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Academic qualification updated successfully')
  updateAcademicQualification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('academicQualificationId', ParseIntPipe)
    academicQualificationId: number,
    @Body() dto: UpdateEmployeeAcademicQualificationDto,
  ) {
    return this.employeesService.updateAcademicQualification(
      req.user.companyId!,
      employeeId,
      academicQualificationId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/academic-qualifications/:academicQualificationId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an academic qualification')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Academic qualification removed successfully')
  removeAcademicQualification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('academicQualificationId', ParseIntPipe)
    academicQualificationId: number,
  ) {
    return this.employeesService.removeAcademicQualification(
      req.user.companyId!,
      employeeId,
      academicQualificationId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  PROFESSIONAL QUALIFICATIONS
  // ════════════════════════════════════════════

  @Get(':employeeId/professional-qualifications')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperationSummary('List professional qualifications for an employee')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Professional qualifications retrieved')
  listProfessionalQualifications(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.employeesService.listProfessionalQualifications(
      req.user.companyId!,
      employeeId,
      req.user,
    );
  }

  @Post(':employeeId/professional-qualifications')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add a professional qualification to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Professional qualification added successfully')
  addProfessionalQualification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeProfessionalQualificationDto,
  ) {
    return this.employeesService.addProfessionalQualification(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/professional-qualifications/:professionalQualificationId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update a professional qualification')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Professional qualification updated successfully')
  updateProfessionalQualification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('professionalQualificationId', ParseIntPipe)
    professionalQualificationId: number,
    @Body() dto: UpdateEmployeeProfessionalQualificationDto,
  ) {
    return this.employeesService.updateProfessionalQualification(
      req.user.companyId!,
      employeeId,
      professionalQualificationId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/professional-qualifications/:professionalQualificationId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove a professional qualification')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Professional qualification removed successfully')
  removeProfessionalQualification(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('professionalQualificationId', ParseIntPipe)
    professionalQualificationId: number,
  ) {
    return this.employeesService.removeProfessionalQualification(
      req.user.companyId!,
      employeeId,
      professionalQualificationId,
      req.user,
    );
  }

  // ════════════════════════════════════════════
  //  EXPERIENCE DETAILS
  // ════════════════════════════════════════════

  @Get(':employeeId/experience-details')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperationSummary('List experience details for an employee')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Experience details retrieved')
  listExperienceDetails(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.employeesService.listExperienceDetails(
      req.user.companyId!,
      employeeId,
      req.user,
    );
  }

  @Post(':employeeId/experience-details')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Add an experience detail to an employee profile')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(201, 'Experience detail added successfully')
  addExperienceDetail(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateEmployeeExperienceDto,
  ) {
    return this.employeesService.addExperienceDetail(
      req.user.companyId!,
      employeeId,
      dto,
      req.user,
    );
  }

  @Patch(':employeeId/experience-details/:experienceDetailId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Update an employee experience detail')
  @ApiAuthRequired()
  @ApiValidationErrorResponse()
  @ApiSuccessResponse(200, 'Experience detail updated successfully')
  updateExperienceDetail(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('experienceDetailId', ParseIntPipe) experienceDetailId: number,
    @Body() dto: UpdateEmployeeExperienceDto,
  ) {
    return this.employeesService.updateExperienceDetail(
      req.user.companyId!,
      employeeId,
      experienceDetailId,
      dto,
      req.user,
    );
  }

  @Delete(':employeeId/experience-details/:experienceDetailId')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperationSummary('Remove an employee experience detail')
  @ApiAuthRequired()
  @ApiSuccessResponse(200, 'Experience detail removed successfully')
  removeExperienceDetail(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('experienceDetailId', ParseIntPipe) experienceDetailId: number,
  ) {
    return this.employeesService.removeExperienceDetail(
      req.user.companyId!,
      employeeId,
      experienceDetailId,
      req.user,
    );
  }
}
