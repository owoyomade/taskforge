
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attachments": {
                  Row: {
                    "content_type": string,"created_at": string,"file_name": string,"id": string,"project_id": string,"size_bytes": number,"storage_path": string,"task_id": string,"uploaded_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_type": string,"created_at"?: string,"file_name": string,"id"?: string,"project_id": string,"size_bytes": number,"storage_path": string,"task_id": string,"uploaded_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "content_type"?: string,"created_at"?: string,"file_name"?: string,"id"?: string,"project_id"?: string,"size_bytes"?: number,"storage_path"?: string,"task_id"?: string,"uploaded_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "attachments_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"board_columns": {
                  Row: {
                    "created_at": string,"id": string,"is_done": boolean,"name": string,"position": number,"project_id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_done"?: boolean,"name": string,"position": number,"project_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_done"?: boolean,"name"?: string,"position"?: number,"project_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_columns_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"checklist_items": {
                  Row: {
                    "checklist_id": string,"content": string,"created_at": string,"id": string,"is_done": boolean,"position": number,"project_id": string,"task_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checklist_id": string,"content": string,"created_at"?: string,"id"?: string,"is_done"?: boolean,"position"?: number,"project_id": string,"task_id": string,"workspace_id": string
                  }
                  Update: {
                    "checklist_id"?: string,"content"?: string,"created_at"?: string,"id"?: string,"is_done"?: boolean,"position"?: number,"project_id"?: string,"task_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklist_items_checklist_id_task_id_fkey"
      columns: ["checklist_id","task_id"]
isOneToOne: false
      referencedRelation: "checklists"
      referencedColumns: ["id","task_id"]
    },{
      foreignKeyName: "checklist_items_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "checklist_items_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    }
                  ]
                },"checklists": {
                  Row: {
                    "created_at": string,"id": string,"position": number,"project_id": string,"task_id": string,"title": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"position"?: number,"project_id": string,"task_id": string,"title"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"position"?: number,"project_id"?: string,"task_id"?: string,"title"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklists_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "checklists_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    }
                  ]
                },"comment_mentions": {
                  Row: {
                    "comment_id": string,"project_id": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id": string,"project_id": string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "comment_id"?: string,"project_id"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comment_mentions_comment_id_project_id_fkey"
      columns: ["comment_id","project_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "comment_mentions_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "comment_mentions_workspace_id_user_id_fkey"
      columns: ["workspace_id","user_id"]
isOneToOne: false
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"edited_at": string | null,"id": string,"project_id": string,"task_id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"project_id": string,"task_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"project_id"?: string,"task_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "comments_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    }
                  ]
                },"labels": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "labels_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"milestone_tasks": {
                  Row: {
                    "milestone_id": string,"project_id": string,"task_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "milestone_id": string,"project_id": string,"task_id": string,"workspace_id": string
                  }
                  Update: {
                    "milestone_id"?: string,"project_id"?: string,"task_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "milestone_tasks_milestone_id_project_id_fkey"
      columns: ["milestone_id","project_id"]
isOneToOne: false
      referencedRelation: "milestones"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "milestone_tasks_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "milestone_tasks_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    }
                  ]
                },"milestones": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"name": string,"owner_id": string | null,"position": number,"project_id": string,"target_date": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"id"?: string,"name": string,"owner_id"?: string | null,"position"?: number,"project_id": string,"target_date"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"name"?: string,"owner_id"?: string | null,"position"?: number,"project_id"?: string,"target_date"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "milestones_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "milestones_workspace_id_owner_id_fkey"
      columns: ["workspace_id","owner_id"]
isOneToOne: false
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"created_at"?: string,"email": string,"full_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_members": {
                  Row: {
                    "created_at": string,"project_id": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"project_id": string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"project_id"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "project_members_workspace_id_user_id_fkey"
      columns: ["workspace_id","user_id"]
isOneToOne: false
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"project_templates": {
                  Row: {
                    "created_at": string,"created_by": string | null,"definition": NonNullable<Json>,"description": string,"id": string,"name": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"definition": NonNullable<Json>,"description"?: string,"id"?: string,"name": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"definition"?: NonNullable<Json>,"description"?: string,"id"?: string,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_templates_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "archived_at": string | null,"color": string,"created_at": string,"created_by": string | null,"description": string,"id": string,"name": string,"owner_id": string | null,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"target_date": string | null,"updated_at": string,"visibility": Database["public"]['Enums']["project_visibility"],"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"color"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"name": string,"owner_id"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"target_date"?: string | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["project_visibility"],"workspace_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"name"?: string,"owner_id"?: string | null,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"target_date"?: string | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["project_visibility"],"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_owner_id_fkey"
      columns: ["workspace_id","owner_id"]
isOneToOne: false
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"task_assignees": {
                  Row: {
                    "created_at": string,"project_id": string,"task_id": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"project_id": string,"task_id": string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"project_id"?: string,"task_id"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_assignees_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "task_assignees_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "task_assignees_workspace_id_user_id_fkey"
      columns: ["workspace_id","user_id"]
isOneToOne: false
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"task_labels": {
                  Row: {
                    "label_id": string,"project_id": string,"task_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "label_id": string,"project_id": string,"task_id": string,"workspace_id": string
                  }
                  Update: {
                    "label_id"?: string,"project_id"?: string,"task_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_labels_label_id_workspace_id_fkey"
      columns: ["label_id","workspace_id"]
isOneToOne: false
      referencedRelation: "labels"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "task_labels_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "task_labels_task_id_project_id_fkey"
      columns: ["task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "archived_at": string | null,"column_id": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"description": string,"due_date": string | null,"id": string,"parent_task_id": string | null,"position": number,"priority": Database["public"]['Enums']["task_priority"],"project_id": string,"start_date": string | null,"title": string,"updated_at": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"column_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string,"due_date"?: string | null,"id"?: string,"parent_task_id"?: string | null,"position"?: number,"priority"?: Database["public"]['Enums']["task_priority"],"project_id": string,"start_date"?: string | null,"title": string,"updated_at"?: string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"column_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string,"due_date"?: string | null,"id"?: string,"parent_task_id"?: string | null,"position"?: number,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string,"start_date"?: string | null,"title"?: string,"updated_at"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_column_id_project_id_fkey"
      columns: ["column_id","project_id"]
isOneToOne: false
      referencedRelation: "board_columns"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_parent_task_id_project_id_fkey"
      columns: ["parent_task_id","project_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","project_id"]
    },{
      foreignKeyName: "tasks_project_id_workspace_id_fkey"
      columns: ["project_id","workspace_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"workspace_invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"declined_at": string | null,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": Database["public"]['Enums']["workspace_role"],"token_hash": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"declined_at"?: string | null,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role": Database["public"]['Enums']["workspace_role"],"token_hash": string,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"declined_at"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["workspace_role"],"token_hash"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": Database["public"]['Enums']["workspace_role"],"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: Database["public"]['Enums']["workspace_role"],"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_access_attachment_path":
{ Args: { "needed": string,"object_name": string }; Returns: boolean
                           },
"can_edit_project":
{ Args: { "target_project": string }; Returns: boolean
                           },
"can_manage_project":
{ Args: { "target_project": string }; Returns: boolean
                           },
"can_view_avatar":
{ Args: { "object_name": string }; Returns: boolean
                           },
"can_view_project":
{ Args: { "target_project": string }; Returns: boolean
                           },
"create_invitation":
{ Args: { "invite_email": string,"invite_role": Database["public"]['Enums']["workspace_role"],"target_workspace": string }; Returns: {
              "invitation_id": string,"token": string
            }[]
                           },
"create_project":
{ Args: { "project_color": string,"project_description": string,"project_name": string,"project_visibility": Database["public"]['Enums']["project_visibility"],"target_workspace": string }; Returns: {
              "archived_at": string | null,
"color": string,
"created_at": string,
"created_by": string | null,
"description": string,
"id": string,
"name": string,
"owner_id": string | null,
"start_date": string | null,
"status": Database["public"]['Enums']["project_status"],
"target_date": string | null,
"updated_at": string,
"visibility": Database["public"]['Enums']["project_visibility"],
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "projects"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_project_from_template":
{ Args: { "finish_date"?: string,"project_color": string,"project_description": string,"project_name": string,"project_visibility": Database["public"]['Enums']["project_visibility"],"target_workspace": string,"template"?: Json }; Returns: {
              "archived_at": string | null,
"color": string,
"created_at": string,
"created_by": string | null,
"description": string,
"id": string,
"name": string,
"owner_id": string | null,
"start_date": string | null,
"status": Database["public"]['Enums']["project_status"],
"target_date": string | null,
"updated_at": string,
"visibility": Database["public"]['Enums']["project_visibility"],
"workspace_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "projects"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_workspace":
{ Args: { "workspace_name": string,"workspace_slug": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"id": string,
"name": string,
"slug": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "workspaces"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_user_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"duplicate_task":
{ Args: { "source_task": string }; Returns: string
                           },
"has_workspace_role":
{ Args: { "allowed_roles": (Database["public"]['Enums']["workspace_role"])[],"target_workspace": string }; Returns: boolean
                           },
"invitation_preview":
{ Args: { "raw_token": string }; Returns: {
              "email_hint": string,"invitation_id": string,"inviter_name": string,"role": Database["public"]['Enums']["workspace_role"],"status": string,"workspace_name": string
            }[]
                           },
"is_workspace_member":
{ Args: { "target_workspace": string }; Returns: boolean
                           },
"list_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "expires_at": string,"invitation_id": string,"inviter_name": string,"role": Database["public"]['Enums']["workspace_role"],"workspace_name": string
            }[]
                           },
"project_access":
{ Args: { "target_project": string }; Returns: string
                           },
"respond_to_invitation":
{ Args: { "accept": boolean,"target_invitation": string }; Returns: string
                           },
"shares_workspace_with":
{ Args: { "other_user": string }; Returns: boolean
                           },
"transfer_ownership":
{ Args: { "new_owner": string,"target_workspace": string }; Returns: undefined
                           },
"workspace_role_for":
{ Args: { "target_workspace": string }; Returns: Database["public"]['Enums']["workspace_role"]
                           }
          }
          Enums: {
            "project_status": "planned"|"active"|"on_hold"|"completed","project_visibility": "workspace"|"private","task_priority": "none"|"low"|"medium"|"high"|"urgent","workspace_role": "owner"|"admin"|"member"|"viewer"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "project_status": ["planned", "active", "on_hold", "completed"],"project_visibility": ["workspace", "private"],"task_priority": ["none", "low", "medium", "high", "urgent"],"workspace_role": ["owner", "admin", "member", "viewer"]
          }
        }
} as const
