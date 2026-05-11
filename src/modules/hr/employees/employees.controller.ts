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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AddEmployeeDocumentDto } from './dtos/add-employee-document.dto';
import { ChangeEmployeeStatusDto } from './dtos/change-employee-status.dto';
import { CreateEmployeeAddressDto } from './dtos/create-employee-address.dto';
import { CreateEmployeeBankAccountDto } from './dtos/create-employee-bank-account.dto';
import { CreateEmployeeContactDto } from './dtos/create-employee-contact.dto';
import { CreateEmployeeDto } from './dtos/create-employee.dto';
import { CreateEmployeeIdentificationDto } from './dtos/create-employee-identification.dto';
import { CreateEmployeeRelativeDto } from './dtos/create-employee-relative.dto';
import { EmployeeQueryDto } from './dtos/employee-query.dto';
import { OnboardEmployeeDto } from './dtos/onboard-employee.dto';
import { UpdateEmployeeAddressDto } from './dtos/update-employee-address.dto';
import { UpdateEmployeeBankAccountDto } from './dtos/update-employee-bank-account.dto';
import { UpdateEmployeeContactDto } from './dtos/update-employee-contact.dto';
import { UpdateEmployeeDto } from './dtos/update-employee.dto';
import { UpdateEmployeeIdentificationDto } from './dtos/update-employee-identification.dto';
import { UpdateEmployeeRelativeDto } from './dtos/update-employee-relative.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post('onboard')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:onboard')
  @ApiOperation({
    summary: 'Onboard a new employee by creating the company user and HR profile',
  })
  onboard(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() onboardEmployeeDto: OnboardEmployeeDto,
  ) {
    return this.employeesService.onboard(
      req.user.companyId!,
      onboardEmployeeDto,
      req.user,
    );
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('employees:create')
  @ApiOperation({
    summary: 'Create an HR employee profile for an existing company user',
  })
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
  @ApiOperation({ summary: 'List employees in the active company' })
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findAll(req.user.companyId!, query, req.user);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:read')
  @ApiOperation({ summary: 'Get a full employee profile by ID' })
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.findOne(req.user.companyId!, id, req.user);
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Update an employee profile' })
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
  @ApiOperation({ summary: 'Update an employee lifecycle status' })
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

  @Post(':id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Attach a document to an employee profile' })
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
  @ApiOperation({ summary: 'Remove an employee document' })
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

  // ──────────────────────────────────────────────
  //  CONTACT ENDPOINTS
  // ──────────────────────────────────────────────

  @Post(':employeeId/contacts')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Add a contact to an employee profile' })
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
  @ApiOperation({ summary: 'Update an employee contact' })
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
  @ApiOperation({ summary: 'Remove an employee contact' })
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

  // ──────────────────────────────────────────────
  //  ADDRESS ENDPOINTS
  // ──────────────────────────────────────────────

  @Post(':employeeId/addresses')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Add an address to an employee profile' })
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
  @ApiOperation({ summary: 'Update an employee address' })
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
  @ApiOperation({ summary: 'Remove an employee address' })
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

  // ──────────────────────────────────────────────
  //  RELATIVE ENDPOINTS
  // ──────────────────────────────────────────────

  @Post(':employeeId/relatives')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Add a relative to an employee profile' })
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
  @ApiOperation({ summary: 'Update an employee relative' })
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
  @ApiOperation({ summary: 'Remove an employee relative' })
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

  // ──────────────────────────────────────────────
  //  IDENTIFICATION ENDPOINTS
  // ──────────────────────────────────────────────

  @Post(':employeeId/identifications')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Add an identification document to an employee profile' })
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
  @ApiOperation({ summary: 'Update an employee identification' })
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
  @ApiOperation({ summary: 'Remove an employee identification' })
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

  // ──────────────────────────────────────────────
  //  BANK ACCOUNT ENDPOINTS
  // ──────────────────────────────────────────────

  @Post(':employeeId/bank-accounts')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Add a bank account to an employee profile' })
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
  @ApiOperation({ summary: 'Update an employee bank account' })
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
  @ApiOperation({ summary: 'Remove an employee bank account' })
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

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('employees:delete')
  @ApiOperation({ summary: 'Delete an employee profile' })
  remove(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.employeesService.remove(req.user.companyId!, id, req.user);
  }
}
